# Space Colony

A demo project built to show off **Aiven Runtime** + **Aiven for PostgreSQL**,
provisioned with **Terraform**, wrapped in a small "SimCity in space" game
so the demo has something more interesting to look at than a bare CRUD app.

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
| Database | Aiven for PostgreSQL (PG18), provisioned by Terraform |
| Deployment | Aiven Runtime (Aiven Apps) — one container per service, from a `compose.yaml` manifest |

## Repo layout

```
backend/            Fastify API — sessions, resources, buildings, ships, expeditions
frontend/           three.js scene + DOM overlay UI, built with Vite
db/init.sql          Schema (idempotent — CREATE TABLE IF NOT EXISTS)
db/seed.sql          Catalog: resource/building/ship types, sites, base tiers
                      (idempotent via ON CONFLICT DO UPDATE — re-running it
                      after a balance tweak actually takes effect)
infra/terraform/     Provisions the Aiven for PostgreSQL service, database, and service user
compose.yaml         Aiven Runtime manifest (also runnable locally via `docker compose`)
Makefile             Everything below, as make targets
```

## Local development

Needs Node 20+, Docker, and (only for the real-Aiven steps) Terraform and
an Aiven API token.

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

Run `make help` any time for the full command list, including the
real-Aiven targets described next.

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

### 1. Provision Postgres with Terraform

```bash
export TF_VAR_aiven_api_token=...   # never commit this
export TF_VAR_aiven_project=...
make init      # terraform init + apply + migrate, in one shot
```

Or step by step: `make tf-plan`, `make tf-apply`, `make migrate`. `make
tf-output` prints the connection details (host, port, database, admin and
app_runtime credentials) if you need them by hand.

`make migrate` (and the underlying `npm run migrate` in `backend/`) applies
`db/init.sql` and `db/seed.sql` as the service **admin** user
(`avnadmin`), not `app_runtime` — Postgres 15+ revokes `CREATE` on schema
`public` by default, and the admin is the one creating the tables, so only
it has rights on them until `init.sql`'s `GRANT` block hands `app_runtime`
its runtime privileges.

### 2. Deploy the backend on Aiven Runtime

1. Aiven Console → **Runtime** → **Deploy application**.
2. Connect your GitHub account and pick this repo/branch.
3. When asked for a manifest, select `compose.yaml` — Aiven Runtime should
   detect all three services (`backend`, `frontend`, `space-colony-pg`).
4. On the `space-colony-pg` card, use the swap-to-existing-service control
   to link it to the real service Terraform created, instead of letting
   Aiven provision a new one.
5. Deploy just the **backend** service first (or deploy everything, but
   don't worry about the frontend's `API_URL` yet — you don't know the
   backend's URL until after this step).
6. Once deployed, check **Overview → Environment variables** on the
   backend app to see what the Postgres connection actually injected —
   Aiven's own docs disagree on whether it's a single `DATABASE_URL` or
   discrete `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`, so
   `backend/src/db/pool.ts` accepts either; you don't need to do anything
   unless neither shows up.
7. Confirm `https://<backend-url>/healthz` returns `{"status":"ok"}`.

### 3. Deploy the frontend, pointed at the backend

**Aiven Runtime does not support internal networking between two app
containers** — the frontend can't reach the backend by a private
hostname. It's wired instead through a public URL passed as an
environment variable:

1. On the **frontend** app (deploy it now if you haven't), go to
   **Environment variables** and set:
   ```
   API_URL=https://<the backend's public URL from step 2>
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

### 4. Verify

Open the frontend's URL. In a fresh browser session: create a game,
collect resources, build something, build and dispatch a ship, watch an
expedition resolve. Close the tab and reopen it — the session token lives
in `localStorage`, and the exact same state should come back from
Postgres. That round trip is the actual point of this demo.

## Environment variables reference

| Var | Read by | Meaning |
|---|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | backend | Discrete Postgres connection params |
| `DATABASE_URL` | backend | Alternative to the above: a single `postgres://...` URI. Backend accepts whichever is set. |
| `PGSSLMODE=disable` | backend | Only for plain local Postgres (no SSL). Never set this against a real Aiven service. |
| `PORT` | backend | HTTP port to listen on (defaults to 3000) |
| `API_URL` | frontend (runtime, via `env.js`) | Backend's public base URL. Empty/unset falls back to a relative `/api` path (local dev only). |

## Known limitations / things that bit us

- **`aiven_service_user` doesn't exist in Aiven's Terraform provider v4** —
  it was renamed to `aiven_pg_user` (and other service-specific
  equivalents) in the v3→v4 upgrade. `infra/terraform/main.tf` already
  uses the right one; mentioned here in case an older example/blog post
  leads you astray.
- **Fastify's `setErrorHandler` must be called before registering routes**
  — it binds to whichever handler is active at the moment each route is
  registered, not dynamically at request time. `backend/src/server.ts`
  sets it first for exactly this reason; don't reorder it.
- **`tsx` needs `--import`, not `--loader`**, on modern Node — the
  `migrate` npm script uses the `tsx` CLI directly rather than
  `node --loader tsx` to sidestep this entirely.
- **Postgres 15+ revokes `CREATE` on schema `public` by default** — see
  the admin-vs-`app_runtime` note in the deploy steps above.
- **Aiven Runtime doesn't link two app containers to each other** — only
  app-to-data-service connections are automatic; app-to-app needs the
  `API_URL`-style env var wiring described above.
- Aiven Runtime is Limited Availability; behavior around manifest
  detection, env var injection, and the composer UI may shift under you.
  If something in this README stops matching what you see in the console,
  the console is the source of truth.
