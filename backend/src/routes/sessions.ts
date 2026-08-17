import type { FastifyInstance } from "fastify";
import { createSessionWithBase, getSessionAndBaseByToken } from "../db/sessions.js";
import { getFullState } from "../lib/state.js";
import { applyPassiveProduction, getResourceBalances } from "../db/resources.js";

export async function sessionsRoutes(app: FastifyInstance) {
  app.post("/api/sessions", async (_req, reply) => {
    const { session, base } = await createSessionWithBase();
    const state = await getFullState(session, base);
    reply.code(201).send({ session_token: session.session_token, ...state });
  });

  app.get<{ Params: { token: string } }>("/api/sessions/:token/state", async (req) => {
    const { session, base } = await getSessionAndBaseByToken(req.params.token);
    return getFullState(session, base);
  });

  app.post<{ Params: { token: string } }>("/api/sessions/:token/collect", async (req) => {
    const { base } = await getSessionAndBaseByToken(req.params.token);
    await applyPassiveProduction(base.id);
    return { resources: await getResourceBalances(base.id) };
  });
}
