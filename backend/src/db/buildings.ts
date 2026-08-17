import type { PoolClient } from "pg";
import { pool } from "./pool.js";
import { GameError, NotFoundError } from "../lib/errors.js";
import { costForLevel, type Cost } from "../lib/cost.js";

export interface BuildingRow {
  id: string;
  base_id: string;
  building_code: string;
  level: number;
  status: string;
}

interface BuildingTypeRow {
  code: string;
  max_level: number;
  min_base_tier: number;
  base_cost: Cost;
  cost_growth_factor: string;
}

export async function listBuildings(baseId: string): Promise<BuildingRow[]> {
  const { rows } = await pool.query<BuildingRow>(
    `SELECT id, base_id, building_code, level, status FROM buildings WHERE base_id = $1 ORDER BY created_at`,
    [baseId],
  );
  return rows;
}

// Locks the resource_balances rows involved and throws INSUFFICIENT_RESOURCES
// if any are short, otherwise deducts them in place. Caller must be inside a
// transaction (BEGIN already issued on `client`).
export async function deductResources(client: PoolClient, baseId: string, cost: Cost): Promise<void> {
  const codes = Object.keys(cost);
  if (codes.length === 0) return;

  const { rows } = await client.query<{ resource_code: string; amount: string }>(
    `SELECT resource_code, amount FROM resource_balances
     WHERE base_id = $1 AND resource_code = ANY($2::text[]) FOR UPDATE`,
    [baseId, codes],
  );
  const balances = new Map(rows.map((r) => [r.resource_code, Number(r.amount)]));

  for (const code of codes) {
    if ((balances.get(code) ?? 0) < cost[code]) {
      throw new GameError("INSUFFICIENT_RESOURCES", `Not enough ${code}`);
    }
  }

  for (const [code, amount] of Object.entries(cost)) {
    await client.query(
      `UPDATE resource_balances SET amount = amount - $1 WHERE base_id = $2 AND resource_code = $3`,
      [amount, baseId, code],
    );
  }
}

export async function creditResources(client: PoolClient, baseId: string, gains: Cost): Promise<void> {
  for (const [code, amount] of Object.entries(gains)) {
    if (amount === 0) continue;
    await client.query(
      `UPDATE resource_balances SET amount = amount + $1 WHERE base_id = $2 AND resource_code = $3`,
      [amount, baseId, code],
    );
  }
}

async function getBuildingType(client: PoolClient, code: string): Promise<BuildingTypeRow> {
  const { rows } = await client.query<BuildingTypeRow>(
    `SELECT code, max_level, min_base_tier, base_cost, cost_growth_factor FROM building_types WHERE code = $1`,
    [code],
  );
  if (!rows[0]) throw new NotFoundError(`Unknown building type: ${code}`);
  return rows[0];
}

export async function createBuilding(
  baseId: string,
  baseTier: number,
  buildSlots: number,
  buildingCode: string,
): Promise<BuildingRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const buildingType = await getBuildingType(client, buildingCode);
    if (baseTier < buildingType.min_base_tier) {
      throw new GameError("TIER_TOO_LOW", `${buildingCode} requires base tier ${buildingType.min_base_tier}`);
    }

    const { rows: existing } = await client.query(
      `SELECT id FROM buildings WHERE base_id = $1 AND building_code = $2`,
      [baseId, buildingCode],
    );
    if (existing.length > 0) {
      throw new GameError("ALREADY_BUILT", `${buildingCode} already exists on this base — use upgrade instead`);
    }

    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM buildings WHERE base_id = $1`,
      [baseId],
    );
    if (Number(countRows[0].count) >= buildSlots) {
      throw new GameError("NO_BUILD_SLOTS", "No free build slots on this base");
    }

    const cost = costForLevel(buildingType.base_cost, Number(buildingType.cost_growth_factor), 1);
    await deductResources(client, baseId, cost);

    const { rows: buildingRows } = await client.query<BuildingRow>(
      `INSERT INTO buildings (base_id, building_code, level, status)
       VALUES ($1, $2, 1, 'active') RETURNING id, base_id, building_code, level, status`,
      [baseId, buildingCode],
    );

    await client.query("COMMIT");
    return buildingRows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upgradeBuilding(baseId: string, buildingId: string): Promise<BuildingRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: buildingRows } = await client.query<BuildingRow>(
      `SELECT id, base_id, building_code, level, status FROM buildings WHERE id = $1 AND base_id = $2 FOR UPDATE`,
      [buildingId, baseId],
    );
    const building = buildingRows[0];
    if (!building) throw new NotFoundError("Building not found on this base");

    const buildingType = await getBuildingType(client, building.building_code);
    if (building.level >= buildingType.max_level) {
      throw new GameError("MAX_LEVEL", `${building.building_code} is already at max level`);
    }

    const cost = costForLevel(
      buildingType.base_cost,
      Number(buildingType.cost_growth_factor),
      building.level + 1,
    );
    await deductResources(client, baseId, cost);

    const { rows: updated } = await client.query<BuildingRow>(
      `UPDATE buildings SET level = level + 1 WHERE id = $1 RETURNING id, base_id, building_code, level, status`,
      [buildingId],
    );

    await client.query("COMMIT");
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
