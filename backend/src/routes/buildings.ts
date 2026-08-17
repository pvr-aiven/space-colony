import type { FastifyInstance } from "fastify";
import { getSessionAndBaseByToken } from "../db/sessions.js";
import { createBuilding, listBuildings, upgradeBuilding } from "../db/buildings.js";
import { getFullState } from "../lib/state.js";

export async function buildingsRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>("/api/sessions/:token/buildings", async (req) => {
    const { base } = await getSessionAndBaseByToken(req.params.token);
    return { buildings: await listBuildings(base.id) };
  });

  app.post<{ Params: { token: string }; Body: { building_type: string } }>(
    "/api/sessions/:token/buildings",
    async (req, reply) => {
      const { session, base } = await getSessionAndBaseByToken(req.params.token);
      const building = await createBuilding(base.id, base.tier, base.build_slots, req.body.building_type);
      const state = await getFullState(session, base);
      reply.code(201).send({ building, ...state });
    },
  );

  app.post<{ Params: { token: string; id: string } }>(
    "/api/sessions/:token/buildings/:id/upgrade",
    async (req) => {
      const { session, base } = await getSessionAndBaseByToken(req.params.token);
      const building = await upgradeBuilding(base.id, req.params.id);
      const state = await getFullState(session, base);
      return { building, ...state };
    },
  );
}
