import type { FastifyInstance } from "fastify";
import { sessionsRoutes } from "./sessions.js";
import { catalogRoutes } from "./catalog.js";
import { buildingsRoutes } from "./buildings.js";
import { shipsRoutes } from "./ships.js";
import { baseRoutes } from "./base.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(sessionsRoutes);
  await app.register(catalogRoutes);
  await app.register(buildingsRoutes);
  await app.register(shipsRoutes);
  await app.register(baseRoutes);
}
