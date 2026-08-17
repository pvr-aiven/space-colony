import { Pool } from "pg";

// Aiven for PostgreSQL requires SSL; local dev (PGSSLMODE=disable) doesn't offer it.
const ssl = process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };

// Aiven Runtime's docs describe two different shapes for what a "Connect
// service" action injects depending on the page — either a single
// DATABASE_URL connection string, or discrete PGHOST/PGPORT/PGUSER/
// PGPASSWORD/PGDATABASE vars. Rather than bet on one, support both: whichever
// is actually present in the deployed environment is what gets used.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl,
    });
