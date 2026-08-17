import { pool } from "./pool.js";
import { NotFoundError } from "../lib/errors.js";

export interface SessionRow {
  id: string;
  session_token: string;
  display_name: string;
}

export interface BaseRow {
  id: string;
  session_id: string;
  name: string;
  tier: number;
  build_slots: number;
}

export interface SessionAndBase {
  session: SessionRow;
  base: BaseRow;
}

export async function createSessionWithBase(): Promise<SessionAndBase> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: sessionRows } = await client.query<SessionRow>(
      `INSERT INTO sessions DEFAULT VALUES RETURNING id, session_token, display_name`,
    );
    const session = sessionRows[0];

    const { rows: baseRows } = await client.query<BaseRow>(
      `INSERT INTO bases (session_id) VALUES ($1) RETURNING id, session_id, name, tier, build_slots`,
      [session.id],
    );
    const base = baseRows[0];

    // Every base starts with a zeroed balance row per resource type so the
    // passive-production tick has a last_collected_at to compute against.
    await client.query(
      `INSERT INTO resource_balances (base_id, resource_code, amount)
       SELECT $1, code, 0 FROM resource_types`,
      [base.id],
    );

    // A small starting stockpile so the first building isn't blocked on
    // waiting for passive production ticks to accumulate.
    await client.query(
      `UPDATE resource_balances SET amount = 150 WHERE base_id = $1 AND resource_code = 'metal'`,
      [base.id],
    );
    await client.query(
      `UPDATE resource_balances SET amount = 60 WHERE base_id = $1 AND resource_code = 'ice'`,
      [base.id],
    );
    await client.query(
      `UPDATE resource_balances SET amount = 40 WHERE base_id = $1 AND resource_code = 'energy'`,
      [base.id],
    );

    await client.query("COMMIT");
    return { session, base };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionAndBaseByToken(token: string): Promise<SessionAndBase> {
  const { rows: sessionRows } = await pool.query<SessionRow>(
    `UPDATE sessions SET last_seen_at = now() WHERE session_token = $1
     RETURNING id, session_token, display_name`,
    [token],
  );
  const session = sessionRows[0];
  if (!session) throw new NotFoundError("Unknown session token");

  const { rows: baseRows } = await pool.query<BaseRow>(
    `SELECT id, session_id, name, tier, build_slots FROM bases WHERE session_id = $1`,
    [session.id],
  );
  const base = baseRows[0];
  if (!base) throw new NotFoundError("Session has no base");

  return { session, base };
}
