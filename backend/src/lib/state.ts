import { applyPassiveProduction, getResourceBalances } from "../db/resources.js";
import { listBuildings } from "../db/buildings.js";
import { listShips } from "../db/ships.js";
import { listLog, resolveExpiredExpeditions } from "../db/expeditions.js";
import type { BaseRow, SessionRow } from "../db/sessions.js";

export async function getFullState(session: SessionRow, base: BaseRow) {
  await applyPassiveProduction(base.id);
  await resolveExpiredExpeditions(base.id);

  const [resources, buildings, ships, log] = await Promise.all([
    getResourceBalances(base.id),
    listBuildings(base.id),
    listShips(base.id),
    listLog(base.id),
  ]);

  return {
    session: { display_name: session.display_name },
    base,
    resources,
    buildings,
    ships,
    log,
  };
}
