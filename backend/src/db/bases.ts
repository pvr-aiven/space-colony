import { pool } from "./pool.js";
import { deductResources } from "./buildings.js";
import { GameError, NotFoundError } from "../lib/errors.js";
import type { Cost } from "../lib/cost.js";
import type { BaseRow } from "./sessions.js";

interface BaseTierRow {
  tier: number;
  build_slots: number;
  upgrade_cost: Cost | null;
}

export async function upgradeBaseTier(baseId: string, currentTier: number): Promise<BaseRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: tierRows } = await client.query<BaseTierRow>(
      `SELECT tier, build_slots, upgrade_cost FROM base_tiers WHERE tier = $1`,
      [currentTier + 1],
    );
    const nextTier = tierRows[0];
    if (!nextTier) throw new GameError("MAX_TIER", "This base is already at its highest tier");

    if (nextTier.upgrade_cost) {
      await deductResources(client, baseId, nextTier.upgrade_cost);
    }

    const { rows: baseRows } = await client.query<BaseRow>(
      `UPDATE bases SET tier = $1, build_slots = $2 WHERE id = $3
       RETURNING id, session_id, name, tier, build_slots`,
      [nextTier.tier, nextTier.build_slots, baseId],
    );
    if (!baseRows[0]) throw new NotFoundError("Base not found");

    await client.query("COMMIT");
    return baseRows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
