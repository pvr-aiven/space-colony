import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../src/db/pool.js";

// One-off bootstrap: applies db/init.sql then db/seed.sql. Both files are
// idempotent (CREATE TABLE / ON CONFLICT DO NOTHING), so re-running is safe.
const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, "../../db");

async function run() {
  const client = await pool.connect();
  try {
    for (const file of ["init.sql", "seed.sql"]) {
      const sql = readFileSync(path.join(dbDir, file), "utf8");
      console.log(`applying ${file}...`);
      await client.query(sql);
    }
    console.log("done.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
