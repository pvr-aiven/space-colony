# Space Colony — backend

Node.js + TypeScript + Fastify API, backed by Aiven for PostgreSQL. See
`/db/init.sql` and `/db/seed.sql` for schema/catalog, and the API table in
the plan for the full route list.

## Local development

The root [`Makefile`](../Makefile) wraps all of this — from the repo root:

```bash
make install       # npm install for backend + frontend
make local-db      # Postgres 18 in Docker
make local-migrate # applies db/init.sql + db/seed.sql
make dev-backend    # runs the API against that local Postgres
```

Or by hand:

```bash
npm install

# any local Postgres works for dev — Aiven for PostgreSQL requires SSL,
# so PGSSLMODE=disable is only for a plain local instance.
docker run -d --name space-colony-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=space_colony -p 55432:5432 postgres:18-alpine

PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=test PGDATABASE=space_colony PGSSLMODE=disable npm run migrate

PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=test PGDATABASE=space_colony PGSSLMODE=disable npm run dev
```

`GET /healthz` should return `{"status":"ok"}` once the DB is reachable.

## Against the real Aiven service

From the repo root, `make init` runs `terraform init` + `terraform apply` +
the migration in one shot. `make migrate` alone re-applies
`db/init.sql`/`db/seed.sql` against the already-provisioned service.

Migrations run as the service **admin** user (`avnadmin`), not `app_runtime`
— Postgres 15+ no longer grants `CREATE` on schema `public` by default, and
only the owner (the admin, since it creates the tables) has rights on them
otherwise. `db/init.sql` ends with a `GRANT` block that hands `app_runtime`
the privileges it needs at runtime once the tables exist.

Aiven Runtime's Postgres service integration injects `PGHOST`, `PGPORT`,
`PGUSER`, `PGPASSWORD`, `PGDATABASE` for the app itself automatically — no
`PGSSLMODE` env var needed there (SSL is on by default in `src/db/pool.ts`).

## A Fastify gotcha worth knowing

`app.setErrorHandler(...)` must be called **before** registering the routes
it should apply to — Fastify binds each route to whichever error handler is
active at registration time, it doesn't resolve one dynamically per request.
`src/server.ts` sets the handler first for this reason; don't reorder it.
