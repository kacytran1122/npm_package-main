import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createRouter } from "./routes.js";
import { createStore, type Store } from "./store.js";
import type { AuthedRequest } from "./auth.js";

/**
 * Build the app around a store. Exported separately from the listener so tests
 * can drive it with an in-memory store and no open port.
 */
export function createApp(store: Store) {
  const app = express();

  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
  app.use(express.json({ limit: "8mb" })); // bulk imports can be large

  app.use((req, _res, next) => {
    req.store = store;
    next();
  });

  app.use("/api/v1", createRouter());

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[selakata]", error);
    // Never leak a stack trace to the client in production.
    res.status(500).json({
      error: config.isProd ? "Internal server error" : error.message,
    });
  });

  return app;
}

async function main() {
  const store = await createStore();
  const app = createApp(store);

  app.listen(config.port, () => {
    console.log(`[selakata] API listening on :${config.port} (${config.nodeEnv})`);
  });
}

// Only start a listener when run directly, not when imported by tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { createStore };
