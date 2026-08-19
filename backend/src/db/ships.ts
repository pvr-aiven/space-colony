import { pool } from "./pool.js";
import { GameError, NotFoundError } from "../lib/errors.js";
import type { Cost } from "../lib/cost.js";
import { deductResources } from "./buildings.js";

export interface ShipRow {
  id: string;
  base_id: string;
  ship_code: string;
  name: string | null;
  status: string;
  current_site_id: string | null;
  departed_at: string | null;
  eta_at: string | null;
}

interface ShipTypeRow {
  code: string;
  min_base_tier: number;
  base_cost: Cost;
  speed_factor: string;
}

export async function listShips(baseId: string): Promise<ShipRow[]> {
  const { rows } = await pool.query<ShipRow>(
    `SELECT id, base_id, ship_code, name, status, current_site_id, departed_at, eta_at
     FROM ships WHERE base_id = $1 ORDER BY created_at`,
    [baseId],
  );
  return rows;
}

export async function createShip(baseId: string, baseTier: number, shipCode: string): Promise<ShipRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: shipTypeRows } = await client.query<ShipTypeRow>(
      `SELECT code, min_base_tier, base_cost, speed_factor FROM ship_types WHERE code = $1`,
      [shipCode],
    );
    const shipType = shipTypeRows[0];
    if (!shipType) throw new NotFoundError(`Unknown ship type: ${shipCode}`);
    if (baseTier < shipType.min_base_tier) {
      throw new GameError("TIER_TOO_LOW", `${shipCode} requires base tier ${shipType.min_base_tier}`);
    }

    const { rows: shipyard } = await client.query(
      `SELECT id FROM buildings WHERE base_id = $1 AND building_code = 'shipyard' AND status = 'active'`,
      [baseId],
    );
    if (shipyard.length === 0) {
      throw new GameError("NO_SHIPYARD", "Build a shipyard before constructing ships");
    }

    await deductResources(client, baseId, shipType.base_cost);

    const { rows: shipRows } = await client.query<ShipRow>(
      `INSERT INTO ships (base_id, ship_code, status)
       VALUES ($1, $2, 'idle')
       RETURNING id, base_id, ship_code, name, status, current_site_id, departed_at, eta_at`,
      [baseId, shipCode],
    );

    await client.query("COMMIT");
    return shipRows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function dispatchShip(baseId: string, shipId: string, siteId: string): Promise<ShipRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: shipRows } = await client.query<ShipRow & { speed_factor: string }>(
      `SELECT s.id, s.base_id, s.ship_code, s.name, s.status, s.current_site_id, s.departed_at, s.eta_at,
              st.speed_factor
       FROM ships s
       JOIN ship_types st ON st.code = s.ship_code
       WHERE s.id = $1 AND s.base_id = $2 FOR UPDATE OF s`,
      [shipId, baseId],
    );
    const ship = shipRows[0];
    if (!ship) throw new NotFoundError("Ship not found on this base");
    if (ship.status !== "idle") {
      throw new GameError("SHIP_NOT_IDLE", "Ship must be idle at base to dispatch");
    }

    const { rows: siteRows } = await client.query<{
      id: string;
      display_name: string;
      travel_time_minutes: number;
      travel_requires: string | null;
    }>(
      `SELECT id, display_name, travel_time_minutes, travel_requires FROM sites WHERE id = $1`,
      [siteId],
    );
    const site = siteRows[0];
    if (!site) throw new NotFoundError("Unknown site");

    // Deep-space sites need an enabling building (the quantum gate). The
    // frontend greys these out already, but that's presentation — this is
    // the check that actually matters.
    if (site.travel_requires) {
      const { rows: enabling } = await client.query(
        `SELECT 1 FROM buildings
         WHERE base_id = $1 AND building_code = $2 AND status = 'active'`,
        [baseId, site.travel_requires],
      );
      if (enabling.length === 0) {
        throw new GameError(
          "MISSING_REQUIRED_BUILDING",
          `Reaching ${site.display_name} requires an active ${site.travel_requires.replace(/_/g, " ")}`,
        );
      }
    }

    const effectiveMinutes = site.travel_time_minutes / Number(ship.speed_factor);

    const { rows: updated } = await client.query<ShipRow>(
      `UPDATE ships
       SET status = 'en_route', current_site_id = $1, departed_at = now(),
           eta_at = now() + ($2 || ' minutes')::interval
       WHERE id = $3
       RETURNING id, base_id, ship_code, name, status, current_site_id, departed_at, eta_at`,
      [siteId, effectiveMinutes, shipId],
    );

    await client.query(
      `INSERT INTO expeditions (base_id, ship_id, site_id, departed_at) VALUES ($1, $2, $3, now())`,
      [baseId, shipId, siteId],
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
