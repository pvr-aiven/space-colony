import { pool } from "./pool.js";

export interface ResourceBalance {
  resource_code: string;
  amount: string;
}

// Lazily credits passive production accrued since each resource's
// last_collected_at, based on currently active buildings. Called on every
// state read so there's no separate scheduler process to deploy.
export async function applyPassiveProduction(baseId: string): Promise<void> {
  await pool.query(
    `WITH rates AS (
       SELECT bt.production->>'resource' AS resource_code,
              SUM((bt.production->>'rate_per_hour')::numeric * b.level) AS rate_per_hour
       FROM buildings b
       JOIN building_types bt ON bt.code = b.building_code
       WHERE b.base_id = $1 AND b.status = 'active' AND bt.production IS NOT NULL
       GROUP BY bt.production->>'resource'
     )
     UPDATE resource_balances rb
     SET amount = rb.amount + COALESCE(r.rate_per_hour, 0)
                    * (EXTRACT(EPOCH FROM (now() - rb.last_collected_at)) / 3600.0),
         last_collected_at = now()
     FROM resource_types rt
     LEFT JOIN rates r ON r.resource_code = rt.code
     WHERE rb.base_id = $1 AND rb.resource_code = rt.code`,
    [baseId],
  );
}

export async function getResourceBalances(baseId: string): Promise<ResourceBalance[]> {
  const { rows } = await pool.query<ResourceBalance>(
    `SELECT resource_code, amount FROM resource_balances WHERE base_id = $1 ORDER BY resource_code`,
    [baseId],
  );
  return rows;
}
