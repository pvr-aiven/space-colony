import type { FastifyInstance } from "fastify";
import { getCatalog } from "../db/catalog.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/api/meta/catalog", async () => getCatalog());

  // Sites are a fixed catalog (no per-session discovery state in this
  // scope), but kept under /sessions/:token for API-shape consistency.
  app.get("/api/sessions/:token/sites", async () => {
    const { sites } = await getCatalog();
    return { sites };
  });
}
