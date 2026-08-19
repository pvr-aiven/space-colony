import type { PoolClient } from "pg";
import { pool } from "./pool.js";
import { creditResources } from "./buildings.js";
import { GameError, NotFoundError } from "../lib/errors.js";
import type { Cost } from "../lib/cost.js";

export interface ExpeditionRow {
  id: string;
  base_id: string;
  ship_id: string;
  site_id: string;
  departed_at: string;
  resolved_at: string | null;
  outcome: string | null;
  resources_gained: Record<string, number> | null;
  log_message: string | null;
}

type YieldTable = Record<string, [number, number]>;

function rollYield(yieldTable: YieldTable, multiplier: number): Cost {
  const gains: Cost = {};
  for (const [code, [min, max]] of Object.entries(yieldTable)) {
    const rolled = min + Math.random() * (max - min);
    const amount = Math.round(rolled * multiplier);
    if (amount > 0) gains[code] = amount;
  }
  return gains;
}

// A ship can only carry so much home. Scaled down proportionally rather than
// truncating whichever resources happen to be iterated last, so an
// over-capacity haul keeps the site's yield *ratios* intact — it just brings
// back less of everything.
function applyCargoLimit(gains: Cost, cargoCapacity: number): { limited: Cost; overflowed: boolean } {
  const total = Object.values(gains).reduce((sum, n) => sum + n, 0);
  if (total <= cargoCapacity) return { limited: gains, overflowed: false };

  const ratio = cargoCapacity / total;
  const limited: Cost = {};
  for (const [code, amount] of Object.entries(gains)) {
    const scaled = Math.floor(amount * ratio);
    if (scaled > 0) limited[code] = scaled;
  }
  return { limited, overflowed: true };
}

async function resolveOneExpedition(
  client: PoolClient,
  expedition: { id: string; ship_id: string; site_id: string; base_id: string },
): Promise<void> {
  const { rows: siteRows } = await client.query<{ risk_pct: string; yield_table: YieldTable; display_name: string }>(
    `SELECT risk_pct, yield_table, display_name FROM sites WHERE id = $1`,
    [expedition.site_id],
  );
  const site = siteRows[0];

  const roll = Math.random();
  const riskPct = Number(site.risk_pct);
  let outcome: "success" | "partial" | "failed";
  let multiplier: number;
  if (roll < riskPct) {
    outcome = "failed";
    multiplier = 0;
  } else if (roll < riskPct + 0.15) {
    outcome = "partial";
    multiplier = 0.5;
  } else {
    outcome = "success";
    multiplier = 1;
  }

  const { rows: shipRows } = await client.query<{ cargo_capacity: number }>(
    `SELECT st.cargo_capacity
     FROM ships s JOIN ship_types st ON st.code = s.ship_code
     WHERE s.id = $1`,
    [expedition.ship_id],
  );
  const cargoCapacity = shipRows[0]?.cargo_capacity ?? Number.MAX_SAFE_INTEGER;

  const rolled = multiplier > 0 ? rollYield(site.yield_table, multiplier) : {};
  const { limited: gains, overflowed } = applyCargoLimit(rolled, cargoCapacity);
  if (Object.keys(gains).length > 0) {
    await creditResources(client, expedition.base_id, gains);
  }

  const cargoNote = overflowed ? ` Cargo hold filled at ${cargoCapacity} — the rest was left behind.` : "";
  const logMessage =
    outcome === "failed"
      ? `Expedition to ${site.display_name} returned empty-handed.`
      : outcome === "partial"
        ? `Expedition to ${site.display_name} recovered a partial haul.${cargoNote}`
        : `Expedition to ${site.display_name} was a success.${cargoNote}`;

  await client.query(
    `UPDATE expeditions SET resolved_at = now(), outcome = $1, resources_gained = $2, log_message = $3 WHERE id = $4`,
    [outcome, gains, logMessage, expedition.id],
  );

  await client.query(
    `UPDATE ships SET status = 'idle', current_site_id = NULL, departed_at = NULL, eta_at = NULL WHERE id = $1`,
    [expedition.ship_id],
  );
}

// Called on every state read: resolves any expedition whose ship has reached
// its eta, so the demo never feels stuck waiting on a manual step.
export async function resolveExpiredExpeditions(baseId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: string; ship_id: string; site_id: string }>(
      `SELECT e.id, e.ship_id, e.site_id
       FROM expeditions e
       JOIN ships s ON s.id = e.ship_id
       WHERE e.base_id = $1 AND e.resolved_at IS NULL AND s.eta_at <= now()
       FOR UPDATE OF e`,
      [baseId],
    );

    for (const row of rows) {
      await resolveOneExpedition(client, { ...row, base_id: baseId });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Explicit resolve endpoint — same effect as the lazy resolution above, but
// callable directly and rejects if the ship hasn't arrived yet.
export async function resolveExpedition(baseId: string, expeditionId: string): Promise<ExpeditionRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: string; ship_id: string; site_id: string; eta_at: string | null }>(
      `SELECT e.id, e.ship_id, e.site_id, s.eta_at
       FROM expeditions e
       JOIN ships s ON s.id = e.ship_id
       WHERE e.id = $1 AND e.base_id = $2 AND e.resolved_at IS NULL
       FOR UPDATE OF e`,
      [expeditionId, baseId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundError("Expedition not found or already resolved");
    if (!row.eta_at || new Date(row.eta_at).getTime() > Date.now()) {
      throw new GameError("NOT_READY", "Ship has not arrived yet");
    }

    await resolveOneExpedition(client, { ...row, base_id: baseId });

    const { rows: resolved } = await client.query<ExpeditionRow>(
      `SELECT id, base_id, ship_id, site_id, departed_at, resolved_at, outcome, resources_gained, log_message
       FROM expeditions WHERE id = $1`,
      [expeditionId],
    );

    await client.query("COMMIT");
    return resolved[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listLog(baseId: string, limit = 20): Promise<ExpeditionRow[]> {
  const { rows } = await pool.query<ExpeditionRow>(
    `SELECT id, base_id, ship_id, site_id, departed_at, resolved_at, outcome, resources_gained, log_message
     FROM expeditions WHERE base_id = $1 ORDER BY departed_at DESC LIMIT $2`,
    [baseId, limit],
  );
  return rows;
}
