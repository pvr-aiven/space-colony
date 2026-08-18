# Space Colony

A demo project built to show off **Aiven Runtime** + **Aiven for PostgreSQL**,
wrapped in a small "SimCity in space" game so the demo has something more
interesting to look at than a bare CRUD app.

Loop: collect resources on a home planet → build structures and ships →
send ships to explore fixed sites (asteroids/moons/derelicts) → bring back
rarer resources and `unlock_tokens` → spend them to upgrade the base tier →
unlock bigger buildings and ships. Everything is persisted in Postgres, so
closing the tab and reopening it resumes the same game.

## Stack

| Layer | Choice |
|---|---|
| Frontend | three.js + Vite + TypeScript, vanilla (no framework) |
| Backend | Node.js + Fastify + TypeScript, raw SQL via `pg` |
| Database | Aiven for PostgreSQL — created directly in Aiven Runtime's service composer, or manually in the Aiven console |
| Deployment | Aiven Runtime (Aiven Apps) — one container per service, from a `compose.yaml` manifest |

There's no Terraform here. Aiven's Terraform provider has no resource for
Aiven Runtime applications (it's Limited Availability, console/API only),
and Aiven Runtime's own compose composer can provision the Postgres
service directly — so Terraform would only have added a second tool for
no real benefit. If you're looking for `infra/terraform/`, it existed
early on and was removed once that became clear.

## Repo layout

```
backend/            Fastify API — sessions, resources, buildings, ships, expeditions
frontend/           three.js scene + DOM overlay UI, built with Vite
db/init.sql          Schema (idempotent — CREATE TABLE IF NOT EXISTS)
db/seed.sql          Catalog: resource/building/ship types, sites, base tiers
                      (idempotent via ON CONFLICT DO UPDATE — re-running it
                      after a balance tweak actually takes effect)
compose.yaml         Aiven Runtime manifest (also runnable locally via `docker compose`)
Makefile             Everything below, as make targets
```

## Local development

Needs Node 20+ and Docker.

```bash
make install         # npm install for backend + frontend
make local-db        # Postgres 18 in Docker (space-colony-pg-dev, port 55432)
make local-migrate    # applies db/init.sql + db/seed.sql
make dev-backend      # runs the API on :3000 against that local Postgres
make dev-frontend     # runs the Vite dev server on :5173
```

`make dev-frontend` proxies `/api/*` to `localhost:3000` (see
`frontend/vite.config.ts`) — that's dev-only; the production build talks to
the backend differently (see [Deploying](#deploying-to-aiven), below).

Open `http://localhost:5173`. `make local-db-down` stops and removes the
container when you're done; `make local-reset` does a full down+up+migrate
in one shot if you want a clean slate.

Run `make help` any time for the full command list, including
`seed-prod` for a real Aiven service, described next.

## Local end-to-end check with Docker Compose

Before trusting a change to Aiven Runtime, it's worth running the exact
same `compose.yaml` locally:

```bash
docker compose up -d --build
docker compose exec -T space-colony-pg psql -U app_runtime -d space_colony < db/init.sql
docker compose exec -T space-colony-pg psql -U app_runtime -d space_colony < db/seed.sql
```

Then open `http://localhost:8080`. `docker compose down -v` tears it down.
This is genuinely the same manifest Aiven Runtime reads — if the game
works here, the only thing left to verify after a real deploy is that the
Postgres connection and `API_URL` (below) are wired to the right services.

## Deploying to Aiven

### 1. Get an Aiven for PostgreSQL service

Either works:

- Create one yourself in the Aiven console (any plan/region), or
- Deploy `compose.yaml` on Aiven Runtime first (step 2) and let its
  service composer provision `space-colony-pg` directly from the manifest
  — no separate provisioning step needed.

Either way, note its host, port, database name, and admin (`avnadmin`)
credentials — you'll need them for the next step and possibly for
`API_URL` wiring later.

### 2. Apply the schema

```bash
make seed-prod PGHOST=<host> PGUSER=avnadmin PGPASSWORD=<password> PGDATABASE=<database>
# PGPORT defaults to 5432; pass PGPORT=... if yours differs
```

This runs as the service **admin** user, not an app-specific one —
Postgres 15+ revokes `CREATE` on schema `public` by default, and the
admin is the one creating the tables, so only it has rights on them
until `init.sql`'s `GRANT` block hands out any further access itself (a
no-op unless you've separately created a scoped role).

### 3. Deploy the backend on Aiven Runtime

1. Aiven Console → **Runtime** → **Deploy application**.
2. Connect your GitHub account and pick this repo/branch.
3. When asked for a manifest, select `compose.yaml` — Aiven Runtime should
   detect all three services (`backend`, `frontend`, `space-colony-pg`).
4. On the `space-colony-pg` card, either let it provision a new service
   (if you skipped step 1) or use the swap-to-existing-service control to
   link the one you already created.
5. Deploy just the **backend** service first (or deploy everything, but
   don't worry about the frontend's `API_URL` yet — you don't know the
   backend's URL until after this step).
6. Once deployed, check **Overview → Environment variables** on the
   backend app to see what the Postgres connection actually injected —
   Aiven's own docs disagree on whether it's a single `DATABASE_URL` or
   discrete `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`, so
   `backend/src/db/pool.ts` accepts either (and lets any discrete var you
   add manually override just that one field of a `DATABASE_URL`, e.g. if
   the injected connection points at `defaultdb` and you need
   `PGDATABASE=space_colony` instead).
7. Confirm `https://<backend-url>/healthz` returns `{"status":"ok"}`.

### 4. Deploy the frontend, pointed at the backend

**Aiven Runtime does not support internal networking between two app
containers** — the frontend can't reach the backend by a private
hostname. It's wired instead through a public URL passed as an
environment variable:

1. On the **frontend** app (deploy it now if you haven't), go to
   **Environment variables** and set:
   ```
   API_URL=https://<the backend's public URL from step 3>
   ```
2. Save — Aiven redeploys the frontend container automatically.
3. This works without rebuilding the image: `frontend/docker-entrypoint.sh`
   regenerates `env.js` from `$API_URL` **every time the container
   starts**, and `frontend/src/api/client.ts` reads it at runtime
   (`window.__ENV__.API_URL`) rather than having Vite bake it into the
   bundle at build time. Editing the env var and letting Aiven restart the
   container is enough — no rebuild needed.
4. The backend's CORS is already wide open (`origin: true` in
   `backend/src/server.ts`), so the cross-origin call from the frontend's
   URL to the backend's URL just works once `API_URL` is correct.

### 5. Verify

Open the frontend's URL. In a fresh browser session: create a game,
collect resources, build something, build and dispatch a ship, watch an
expedition resolve. Close the tab and reopen it — the session token lives
in `localStorage`, and the exact same state should come back from
Postgres. That round trip is the actual point of this demo.

## Environment variables reference

| Var | Read by | Meaning |
|---|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | backend | Discrete Postgres connection params. Any of these set explicitly wins over the same field from `DATABASE_URL` if both are present. |
| `DATABASE_URL` | backend | A single `postgres://...` URI, used as the fallback base for whichever discrete fields above aren't set. |
| `PGSSLMODE=disable` | backend | Only for plain local Postgres (no SSL). Never set this against a real Aiven service. |
| `PORT` | backend | HTTP port to listen on (defaults to 3000) |
| `API_URL` | frontend (runtime, via `env.js`) | Backend's public base URL. Empty/unset falls back to a relative `/api` path (local dev only). |

## Known limitations / things that bit us

- **Fastify's `setErrorHandler` must be called before registering routes**
  — it binds to whichever handler is active at the moment each route is
  registered, not dynamically at request time. `backend/src/server.ts`
  sets it first for exactly this reason; don't reorder it.
- **`tsx` needs `--import`, not `--loader`**, on modern Node — the
  `migrate` npm script uses the `tsx` CLI directly rather than
  `node --loader tsx` to sidestep this entirely.
- **Postgres 15+ revokes `CREATE` on schema `public` by default** — see
  the admin-user note in the deploy steps above.
- **Aiven Runtime doesn't link two app containers to each other** — only
  app-to-data-service connections are automatic; app-to-app needs the
  `API_URL`-style env var wiring described above.
- **A `DATABASE_URL` injected by "Connect service" may point at the
  service's default admin connection (`avnadmin`/`defaultdb`), not an
  app-specific user/database** — add a discrete `PGDATABASE` (and/or
  `PGUSER`/`PGPASSWORD`) env var to override just that field; see step 3.6
  above.
- No Terraform, on purpose — see [Stack](#stack).
- Aiven Runtime is Limited Availability; behavior around manifest
  detection, env var injection, and the composer UI may shift under you.
  If something in this README stops matching what you see in the console,
  the console is the source of truth.
