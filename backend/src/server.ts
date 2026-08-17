import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool } from "./db/pool.js";
import { registerRoutes } from "./routes/index.js";
import { GameError } from "./lib/errors.js";
import { getSessionAndBaseByToken } from "./db/sessions.js";
import { getFullState } from "./lib/state.js";

const app = Fastify({ logger: true });

// Fastify binds each route to whatever error handler is active at the
// moment the route is registered — it does not resolve it dynamically at
// request time. setErrorHandler must therefore run before any route/plugin
// registration, or routes registered earlier silently keep the default handler.
app.setErrorHandler(async (err, req, reply) => {
  if (err instanceof GameError) {
    let state: unknown;
    const token = (req.params as Record<string, string> | undefined)?.token;
    if (token) {
      try {
        const { session, base } = await getSessionAndBaseByToken(token);
        state = await getFullState(session, base);
      } catch {
        // token itself was invalid — no state to attach.
      }
    }
    reply.code(err.statusCode).send({ error: err.code, message: err.message, state });
    return;
  }
  req.log.error(err);
  reply.code(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong" });
});

await app.register(cors, { origin: true });

app.get("/healthz", async () => {
  await pool.query("SELECT 1");
  return { status: "ok" };
});

await registerRoutes(app);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
