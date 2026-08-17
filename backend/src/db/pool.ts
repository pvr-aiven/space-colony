import { Pool } from "pg";

// Aiven Runtime's Postgres service integration injects PG* env vars
// (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). Aiven for PostgreSQL requires
// SSL; PGSSLROOTCERT can point at a mounted CA bundle when available.
export const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  // Aiven for PostgreSQL requires SSL; local dev (PGSSLMODE=disable) doesn't offer it.
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
