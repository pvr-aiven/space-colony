-- Static game catalog: resource/building/ship types and the fixed set of
-- explorable sites. Idempotent — safe to re-run against an existing DB to
-- push catalog/balance tweaks (uses DO UPDATE, not DO NOTHING, precisely so
-- re-running this after a rate/cost change actually takes effect).

INSERT INTO base_tiers (tier, build_slots, upgrade_cost) VALUES
    (1, 4, NULL),
    (2, 6, '{"unlock_tokens": 5}'),
    (3, 8, '{"unlock_tokens": 15, "rare_isotopes": 40}')
ON CONFLICT (tier) DO UPDATE SET
    build_slots = EXCLUDED.build_slots,
    upgrade_cost = EXCLUDED.upgrade_cost;

INSERT INTO resource_types (code, display_name, is_currency) VALUES
    ('metal', 'Metal', false),
    ('ice', 'Ice', false),
    ('energy', 'Energy', false),
    ('rare_isotopes', 'Rare Isotopes', false),
    ('unlock_tokens', 'Unlock Tokens', true)
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_currency = EXCLUDED.is_currency;

-- production rate_per_hour values are tuned for a live demo (visible
-- movement within seconds on an 8s poll), not for a realistic idle-game
-- economy — a "per hour" label with these numbers is intentionally fictional.
INSERT INTO building_types (code, display_name, max_level, min_base_tier, base_cost, cost_growth_factor, production, unlocks_building_code) VALUES
    ('solar_array',   'Solar Array',    3, 1, '{"metal": 40}',                     1.5, '{"resource": "energy", "rate_per_hour": 900}',  NULL),
    ('mining_rig',    'Mining Rig',     3, 1, '{"metal": 20, "energy": 10}',       1.5, '{"resource": "metal", "rate_per_hour": 1350}',  NULL),
    ('ice_extractor', 'Ice Extractor',  3, 1, '{"metal": 30, "energy": 10}',       1.5, '{"resource": "ice", "rate_per_hour": 1080}',    NULL),
    ('shipyard',      'Shipyard',       2, 1, '{"metal": 80, "ice": 20}',          1.6, NULL,                                            NULL),
    ('sensor_array',  'Sensor Array',   2, 2, '{"metal": 60, "energy": 40}',       1.6, NULL,                                            'refinery'),
    ('refinery',      'Refinery',       3, 2, '{"metal": 120, "ice": 40}',         1.7, '{"resource": "rare_isotopes", "rate_per_hour": 360}', NULL),
    -- Endgame unlock: gates travel to the deep-space sites that sensor_array
    -- reveals. Deliberately expensive in rare_isotopes, which only the
    -- refinery produces passively, so tier 2 has to be built out first.
    ('quantum_gate',  'Quantum Gate',   2, 3, '{"metal": 400, "energy": 200, "rare_isotopes": 60}', 1.8, NULL, NULL)
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    max_level = EXCLUDED.max_level,
    min_base_tier = EXCLUDED.min_base_tier,
    base_cost = EXCLUDED.base_cost,
    cost_growth_factor = EXCLUDED.cost_growth_factor,
    production = EXCLUDED.production,
    unlocks_building_code = EXCLUDED.unlocks_building_code;

-- cargo_capacity is a hard cap on the *total* resources one expedition can
-- bring home (enforced in expedition resolution). Sized against the yield
-- tables below: a scout can just about empty a local site, while the
-- deep-space hauls need a freighter or cruiser to be worth the trip.
INSERT INTO ship_types (code, display_name, min_base_tier, base_cost, cargo_capacity, speed_factor) VALUES
    ('scout',         'Scout',          1, '{"metal": 50, "energy": 20}',                 40,  1.5),
    ('freighter',     'Freighter',      1, '{"metal": 120, "ice": 30, "energy": 30}',      150, 1.0),
    ('heavy_cruiser',  'Heavy Cruiser',  2, '{"metal": 300, "ice": 80, "rare_isotopes": 10}', 400, 0.75)
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    min_base_tier = EXCLUDED.min_base_tier,
    base_cost = EXCLUDED.base_cost,
    cargo_capacity = EXCLUDED.cargo_capacity,
    speed_factor = EXCLUDED.speed_factor;

-- Local sites sit within ~12 units of the home base. Deep-space sites are
-- 40-50 units out, in the direction of the sun, so they read as genuinely
-- distant when you zoom out — and they're only reachable by quantum jump.
INSERT INTO sites (code, display_name, kind, difficulty, risk_pct, travel_time_minutes, yield_table, position, reveal_requires, travel_requires) VALUES
    ('asteroid_belt_alpha', 'Asteroid Belt Alpha', 'asteroid', 1, 0.05, 5,
        '{"metal": [20, 40], "ice": [5, 15]}',
        '{"x": 4.8, "y": 0, "z": 1.6}', NULL, NULL),
    ('ice_moon', 'Frostback Moon', 'planet', 1, 0.10, 8,
        '{"ice": [25, 50], "rare_isotopes": [0, 3]}',
        '{"x": -4, "y": 0.4, "z": 4}', NULL, NULL),
    ('derelict_station', 'Derelict Station Kessel', 'derelict', 2, 0.20, 12,
        '{"metal": [15, 30], "rare_isotopes": [3, 8], "unlock_tokens": [1, 2]}',
        '{"x": 7.2, "y": -0.8, "z": -5.6}', NULL, NULL),
    ('volatile_nebula', 'Volatile Nebula', 'asteroid', 3, 0.30, 15,
        '{"rare_isotopes": [5, 12], "energy": [10, 25], "unlock_tokens": [1, 3]}',
        '{"x": -8.8, "y": 1.2, "z": -2.4}', NULL, NULL),
    ('ancient_ruins', 'Ancient Ruins', 'derelict', 4, 0.35, 20,
        '{"rare_isotopes": [8, 18], "unlock_tokens": [2, 5]}',
        '{"x": 0, "y": -0.4, "z": 11.2}', NULL, NULL),

    -- Deep space: revealed by the sensor array, reachable only once the
    -- quantum gate is built. Yields are large enough that cargo_capacity
    -- becomes the real constraint rather than an unused column.
    ('helios_prime', 'Helios Prime', 'deep_planet', 5, 0.20, 6,
        '{"rare_isotopes": [40, 80], "energy": [60, 120], "unlock_tokens": [4, 8]}',
        '{"x": 34, "y": 8, "z": -22}', 'sensor_array', 'quantum_gate'),
    ('crimson_expanse', 'Crimson Expanse', 'deep_planet', 6, 0.28, 8,
        '{"metal": [150, 300], "rare_isotopes": [30, 60], "unlock_tokens": [3, 6]}',
        '{"x": -40, "y": 10, "z": -18}', 'sensor_array', 'quantum_gate'),
    ('outer_ice_belt', 'Outer Ice Belt', 'deep_planet', 7, 0.34, 10,
        '{"ice": [200, 400], "rare_isotopes": [20, 50], "unlock_tokens": [3, 7]}',
        '{"x": 16, "y": -6, "z": 46}', 'sensor_array', 'quantum_gate')
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    kind = EXCLUDED.kind,
    difficulty = EXCLUDED.difficulty,
    risk_pct = EXCLUDED.risk_pct,
    travel_time_minutes = EXCLUDED.travel_time_minutes,
    yield_table = EXCLUDED.yield_table,
    position = EXCLUDED.position,
    reveal_requires = EXCLUDED.reveal_requires,
    travel_requires = EXCLUDED.travel_requires;
