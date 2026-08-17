import type { FastifyInstance } from "fastify";
import { getSessionAndBaseByToken } from "../db/sessions.js";
import { createShip, dispatchShip, listShips } from "../db/ships.js";
import { resolveExpedition, listLog } from "../db/expeditions.js";
import { getFullState } from "../lib/state.js";

export async function shipsRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>("/api/sessions/:token/ships", async (req) => {
    const { base } = await getSessionAndBaseByToken(req.params.token);
    return { ships: await listShips(base.id) };
  });

  app.post<{ Params: { token: string }; Body: { ship_type: string } }>(
    "/api/sessions/:token/ships",
    async (req, reply) => {
      const { session, base } = await getSessionAndBaseByToken(req.params.token);
      const ship = await createShip(base.id, base.tier, req.body.ship_type);
      const state = await getFullState(session, base);
      reply.code(201).send({ ship, ...state });
    },
  );

  app.post<{ Params: { token: string; id: string }; Body: { site_id: string } }>(
    "/api/sessions/:token/ships/:id/dispatch",
    async (req) => {
      const { session, base } = await getSessionAndBaseByToken(req.params.token);
      const ship = await dispatchShip(base.id, req.params.id, req.body.site_id);
      const state = await getFullState(session, base);
      return { ship, ...state };
    },
  );

  app.post<{ Params: { token: string; id: string } }>(
    "/api/sessions/:token/expeditions/:id/resolve",
    async (req) => {
      const { session, base } = await getSessionAndBaseByToken(req.params.token);
      const expedition = await resolveExpedition(base.id, req.params.id);
      const state = await getFullState(session, base);
      return { expedition, ...state };
    },
  );

  app.get<{ Params: { token: string } }>("/api/sessions/:token/log", async (req) => {
    const { base } = await getSessionAndBaseByToken(req.params.token);
    return { log: await listLog(base.id) };
  });
}
