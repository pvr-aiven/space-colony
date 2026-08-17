import { pool } from "./pool.js";

export async function getCatalog() {
  const [resourceTypes, buildingTypes, shipTypes, sites] = await Promise.all([
    pool.query(`SELECT code, display_name, is_currency FROM resource_types ORDER BY code`),
    pool.query(
      `SELECT code, display_name, max_level, min_base_tier, base_cost, cost_growth_factor, production, unlocks_building_code
       FROM building_types ORDER BY min_base_tier, code`,
    ),
    pool.query(
      `SELECT code, display_name, min_base_tier, base_cost, cargo_capacity, speed_factor
       FROM ship_types ORDER BY min_base_tier, code`,
    ),
    pool.query(
      `SELECT id, code, display_name, kind, difficulty, risk_pct, travel_time_minutes, yield_table, position
       FROM sites ORDER BY difficulty, code`,
    ),
  ]);

  return {
    resource_types: resourceTypes.rows,
    building_types: buildingTypes.rows,
    ship_types: shipTypes.rows,
    sites: sites.rows,
  };
}
