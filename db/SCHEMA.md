# Database schema

Source of truth is [`init.sql`](init.sql) (structure) and [`seed.sql`](seed.sql)
(catalog data) — this file explains what's in them and why. One player =
one session = one base for this scope: there's no multi-base or
multiplayer support.

Tables split into two groups:

- **Catalog tables** — static game-balance data (`resource_types`,
  `building_types`, `ship_types`, `sites`, `base_tiers`). Seeded once by
  `seed.sql` and re-synced by re-running it (it uses `ON CONFLICT DO
  UPDATE`, not `DO NOTHING` — a balance tweak takes effect on the next
  `make seed-prod`/`make local-migrate` without needing a fresh database).
- **State tables** — everything that changes as a game is played
  (`sessions`, `bases`, `resource_balances`, `buildings`, `ships`,
  `expeditions`). Empty until players actually create sessions.

## Entity relationships

```mermaid
erDiagram
    sessions ||--|| bases : "has one"
    bases ||--o{ resource_balances : has
    bases ||--o{ buildings : has
    bases ||--o{ ships : has
    bases ||--o{ expeditions : has

    resource_types ||--o{ resource_balances : "is a"
    building_types ||--o{ buildings : "is a"
    ship_types ||--o{ ships : "is a"
    sites ||--o{ ships : "current location of"
    sites ||--o{ expeditions : "destination of"
    ships ||--o{ expeditions : "sent on"
    base_tiers ||--|| bases : "gates tier of"
```

## State tables

### `sessions`

One row per game. `session_token` (not `id`) is what the frontend stores
in `localStorage` and sends on every request — it's what makes "close the
tab, reopen it, same game" work. `last_seen_at` is bumped on every
authenticated request.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_token` | uuid, unique | The bearer credential the frontend holds |
| `display_name` | text | Defaults to "Commander"; not currently editable |
| `created_at` / `last_seen_at` | timestamptz | |

### `bases`

The player's single home base. `tier` and `build_slots` only ever change
via the base-upgrade endpoint (`POST /base/upgrade`), which looks up the
next row in `base_tiers` and applies its `build_slots`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid → `sessions.id`, `ON DELETE CASCADE` | |
| `name` | text | Defaults to "Home Base" |
| `tier` | int | Starts at 1; gates `building_types.min_base_tier` / `ship_types.min_base_tier` |
| `build_slots` | int | Max concurrent buildings; starts at 4 (matches the 4 tier-1 building types) |

### `resource_balances`

Per-base inventory, one row per resource type. Passive production is
**not** ticked by a scheduler — it's computed lazily on read (`GET
/state`, `POST /collect`) as `elapsed_time × sum(active buildings' rates)`
since `last_collected_at`, which is then reset to now.

| Column | Type | Notes |
|---|---|---|
| `base_id` | uuid → `bases.id`, `ON DELETE CASCADE` | part of PK |
| `resource_code` | text → `resource_types.code` | part of PK |
| `amount` | numeric, `>= 0` | |
| `last_collected_at` | timestamptz | anchor for the lazy production calc |

### `buildings`

A constructed instance of a `building_types` row. A base can only have
one building per `building_code` at a time (enforced in application code,
not a DB constraint) — building further copies of the same type isn't
supported; you upgrade its `level` instead (capped at `building_types.max_level`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `base_id` | uuid → `bases.id`, `ON DELETE CASCADE` | |
| `building_code` | text → `building_types.code` | |
| `level` | int | 1..`building_types.max_level` |
| `status` | text | `constructing` \| `active` (currently everything resolves to `active` immediately — `constructing` exists for a future build-time delay) |
| `created_at` | timestamptz | |

### `ships`

A constructed instance of a `ship_types` row. `current_site_id` /
`departed_at` / `eta_at` are only set while `status = 'en_route'`; the
frontend interpolates the ship's visual position between them client-side
rather than polling for smooth movement.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `base_id` | uuid → `bases.id`, `ON DELETE CASCADE` | |
| `ship_code` | text → `ship_types.code` | |
| `name` | text, nullable | Not currently settable by players |
| `status` | text | `idle` \| `en_route` \| `returning` \| `lost` (`returning`/`lost` aren't emitted by any code path yet — reserved for a future recall feature) |
| `current_site_id` | uuid → `sites.id`, nullable | |
| `departed_at` / `eta_at` | timestamptz, nullable | |
| `created_at` | timestamptz | |

### `expeditions`

One row per ship dispatch, created when a ship departs and filled in when
it resolves. Resolution happens lazily too: any `GET /state` call resolves
every expedition whose ship's `eta_at` has passed, in addition to the
explicit `POST /expeditions/:id/resolve` endpoint — so the game never
feels stuck waiting on a manual step.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `base_id` | uuid → `bases.id`, `ON DELETE CASCADE` | |
| `ship_id` | uuid → `ships.id` | |
| `site_id` | uuid → `sites.id` | |
| `departed_at` | timestamptz | |
| `resolved_at` | timestamptz, nullable | NULL until resolved |
| `outcome` | text, nullable | `success` \| `partial` \| `failed`, rolled against `sites.risk_pct` |
| `resources_gained` | jsonb, nullable | `{resource_code: amount}`, rolled from `sites.yield_table` |
| `log_message` | text, nullable | Human-readable line shown in the mission log |

Indexes: `idx_expeditions_base (base_id, departed_at DESC)`,
`idx_ships_base (base_id)`, `idx_buildings_base (base_id)` — all support
the "list everything for this base" queries `GET /state` does on every call.

## The progression chain

There's no tech-tree table; progression is emergent from four columns spread
across the catalog tables, which between them produce one dependency chain:

```
tier 2 ──> sensor_array ──> refinery ──> tier 3 ──> quantum_gate
             │                 │                        │
             │                 └─ produces              └─ travel_requires:
             │                    rare_isotopes,           unlocks the three
             │                    which the gate           deep_planet sites
             │                    is priced in
             └─ reveal_requires: makes the deep_planet sites visible
                (but not yet reachable)
```

The columns doing the work:

| Column | Table | Effect |
|---|---|---|
| `min_base_tier` | `building_types`, `ship_types` | Hard tier floor |
| `unlocks_building_code` | `building_types` | Enforced build-order prerequisite |
| `reveal_requires` | `sites` | Whether a site is visible at all |
| `travel_requires` | `sites` | Whether a site can be dispatched to |
| `cargo_capacity` | `ship_types` | Caps the haul, so deep sites need a big ship |

The reveal/travel split is the deliberate part: with a sensor array you can
*see* three rich deep-space worlds and read their yields, but dispatching is
refused until the quantum gate is up. And once it is, `cargo_capacity` decides
whether the trip was worth it — measured on the same site, a scout brings home
39 and a heavy cruiser 151.

## Catalog tables

### `base_tiers`

Tier thresholds only; the wider progression picture is above.

| Column | Type | Notes |
|---|---|---|
| `tier` | int PK | |
| `build_slots` | int | What `bases.build_slots` becomes at this tier |
| `upgrade_cost` | jsonb, nullable | `{resource_code: amount}` to reach this tier from the previous one. `NULL` for tier 1 (the starting tier — nothing to buy) |

Seed data: tier 1 (4 slots, free/starting), tier 2 (6 slots, 5
`unlock_tokens`), tier 3 (8 slots, 15 `unlock_tokens` + 40
`rare_isotopes`).

### `resource_types`

| Column | Type | Notes |
|---|---|---|
| `code` | text PK | `metal`, `ice`, `energy`, `rare_isotopes`, `unlock_tokens` |
| `display_name` | text | |
| `is_currency` | boolean | Only `unlock_tokens` — spent on base upgrades, not produced by buildings, only earned from expeditions |

### `building_types`

| Column | Type | Notes |
|---|---|---|
| `code` | text PK | `solar_array`, `mining_rig`, `ice_extractor`, `shipyard`, `sensor_array`, `refinery`, `quantum_gate` |
| `display_name` | text | |
| `max_level` | int | |
| `min_base_tier` | int | `sensor_array`/`refinery` require tier 2, `quantum_gate` tier 3; the rest are tier 1 |
| `base_cost` | jsonb | `{resource_code: amount}` to build at level 1 |
| `cost_growth_factor` | numeric | Cost to reach level *N* = `base_cost × cost_growth_factor^(N-1)` |
| `production` | jsonb, nullable | `{"resource": code, "rate_per_hour": number}`, or `NULL` for buildings with no passive output (`shipyard`, `sensor_array`, `quantum_gate`) |
| `unlocks_building_code` | text → `building_types.code`, nullable | A real prerequisite, enforced in `createBuilding`: to build X, every type declaring `unlocks_building_code = X` must already be built and active. Gives the chain `sensor_array` → `refinery` → `quantum_gate` |

The `rate_per_hour` numbers are tuned for a live demo (visible movement on
an 8-second poll), not a realistic idle-game economy — treat the "per
hour" label as fictional.

### `ship_types`

| Column | Type | Notes |
|---|---|---|
| `code` | text PK | `scout`, `freighter`, `heavy_cruiser` |
| `display_name` | text | |
| `min_base_tier` | int | `heavy_cruiser` requires tier 2 |
| `base_cost` | jsonb | `{resource_code: amount}` |
| `cargo_capacity` | int | Hard cap on the **total** resources one expedition can bring home (40 / 150 / 400). Over-capacity hauls are scaled down proportionally, preserving the site's yield ratios |
| `speed_factor` | numeric | Effective travel time = `sites.travel_time_minutes / speed_factor` — higher is faster |

### `sites`

The fixed set of explorable locations. There's no per-session discovery
state: visibility and reachability are derived from which buildings the base
has (see `reveal_requires` / `travel_requires` below), not stored per player.
Local sites are ungated; the three `deep_planet` sites are revealed by a
sensor array and reachable only with a quantum gate.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text, unique | Stable slug independent of the uuid |
| `display_name` | text | |
| `kind` | text | `asteroid` \| `planet` \| `derelict` \| `deep_planet` — also drives which 3D model the frontend builds, and whether travel is a linear flight or a quantum jump |
| `difficulty` | int | 1-7 in the seed data; scales the visual size and (loosely) the risk/reward |
| `risk_pct` | numeric | Chance of a `failed` (empty-handed) outcome on resolution |
| `travel_time_minutes` | int | Base travel time before a ship's `speed_factor` is applied |
| `yield_table` | jsonb | `{resource_code: [min, max]}` — resolution rolls a random amount per resource in range (halved on a `partial` outcome, which triggers on a second, narrower risk band past `risk_pct`) |
| `position` | jsonb | `{x, y, z}` scene-space coordinates, used directly by the frontend with no scaling. Local sites sit within ~12 units of the home base; `deep_planet` sites are 40-50 units out |
| `reveal_requires` | text → `building_types.code`, nullable | Building needed for the site to appear at all; `NULL` = always visible |
| `travel_requires` | text → `building_types.code`, nullable | Building needed to dispatch there; `NULL` = no requirement. Separate from reveal on purpose — seeing a target you can't yet reach is what makes the gate worth building |

## JSON column shapes, summarized

| Shape | Used by | Example |
|---|---|---|
| Cost / gain map | `base_tiers.upgrade_cost`, `building_types.base_cost`, `ship_types.base_cost`, `expeditions.resources_gained` | `{"metal": 40, "energy": 10}` |
| Production rate | `building_types.production` | `{"resource": "energy", "rate_per_hour": 900}` |
| Yield range table | `sites.yield_table` | `{"metal": [20, 40], "ice": [5, 15]}` |
| 3D position | `sites.position` | `{"x": 12, "y": 0, "z": 4}` |

## Applying this schema

`make local-migrate` (local Postgres) or `make seed-prod PGHOST=... ...`
(a real Aiven service) both run `init.sql` then `seed.sql` — see the
[root README](../README.md#deploying-to-aiven) for the full deploy
sequence. Both files are safe to re-run against a database that already
has them applied.
