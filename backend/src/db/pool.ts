import { Pool, type PoolConfig } from "pg";

// Aiven for PostgreSQL requires SSL; local dev (PGSSLMODE=disable) doesn't offer it.
// rejectUnauthorized: false is what actually lets us skip verifying Aiven's
// self-signed CA — but pg's own connection-string parsing can pick up an
// sslmode query param (Aiven's DATABASE_URL typically has one) and let that
// win over this object instead, which is exactly what caused
// "self-signed certificate in certificate chain" in practice. So we never
// hand pg a connectionString at all — always parse it ourselves into plain
// fields, so this ssl object is the only ssl signal pg ever sees.
const ssl = process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };

// Aiven Runtime's docs describe two different shapes for what a "Connect
// service" action injects depending on the page — either a single
// DATABASE_URL connection string, or discrete PGHOST/PGPORT/PGUSER/
// PGPASSWORD/PGDATABASE vars. Support both, whichever is actually present.
function connectionConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
    };
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

export const pool = new Pool({ ...connectionConfig(), ssl });
