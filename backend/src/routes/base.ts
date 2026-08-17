import type { FastifyInstance } from "fastify";
import { getSessionAndBaseByToken } from "../db/sessions.js";
import { upgradeBaseTier } from "../db/bases.js";
import { getFullState } from "../lib/state.js";

export async function baseRoutes(app: FastifyInstance) {
  app.post<{ Params: { token: string } }>("/api/sessions/:token/base/upgrade", async (req) => {
    const { session, base } = await getSessionAndBaseByToken(req.params.token);
    const updatedBase = await upgradeBaseTier(base.id, base.tier);
    return getFullState(session, updatedBase);
  });
}
