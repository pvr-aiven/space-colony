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

// Aiven Runtime's "Connect service" injects a DATABASE_URL pointing at the
// service's default admin connection (avnadmin@defaultdb), not at our
// app_runtime/space_colony pair. A discrete PG* var manually added on top
// (e.g. PGDATABASE=space_colony) is meant to override just that one field
// — so DATABASE_URL is only ever the fallback *base*, field by field, never
// an all-or-nothing choice. Silently ignoring a manually-set PGDATABASE
// whenever DATABASE_URL also happened to be present was the actual bug
// behind "always connects to defaultdb no matter what I set".
function connectionConfig(): PoolConfig {
  let fromUrl: Partial<PoolConfig> = {};
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    fromUrl = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
    };
  }

  return {
    host: process.env.PGHOST ?? fromUrl.host,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : fromUrl.port,
    user: process.env.PGUSER ?? fromUrl.user,
    password: process.env.PGPASSWORD ?? fromUrl.password,
    database: process.env.PGDATABASE ?? fromUrl.database,
  };
}

const config = connectionConfig();

// Safe to log — no password. Logged through Fastify's pino instance in
// server.ts (not plain console.log — that never showed up in Aiven
// Runtime's log viewer, which expects the same single-line JSON shape
// every other log entry has there).
export function connectionSummary(): Record<string, unknown> {
  return {
    hadDatabaseUrl: Boolean(process.env.DATABASE_URL),
    overriddenFields: ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"].filter(
      (k) => process.env[k] !== undefined,
    ),
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    ssl: ssl === false ? false : "enabled (rejectUnauthorized: false)",
    PGSSLMODE: process.env.PGSSLMODE ?? "(unset)",
  };
}

export const pool = new Pool({ ...config, ssl });
