import { type Logger, silentLogger } from "@app/agent";
import express, { type Express } from "express";
import { requestLog } from "#middleware/requestLog";
import { createHealthRouter } from "#routes/health";
import { createNewsRouter } from "#routes/news";
import { createNewsService, type NewsService } from "#services/news";

// Kept separate from `main.ts` so tests can exercise the app without binding a port.
//
// `service` is the seam for a caller that arrives with an agent it already wired up — a test hands
// in a runner that answers from a fixture, `main.ts` lets the real one be built from the
// environment. Callers that leave it out get the default, which is what the routes are tested
// against.
//
// `logger` defaults to silence: a process decides to log by handing in `createLogger()`, and a test
// that builds an app is not an audience.
export function createApp(
  service: NewsService = createNewsService(),
  logger: Logger = silentLogger,
): Express {
  const app = express();

  // First, so that everything after it — including a body the schema refused — is logged.
  app.use(requestLog(logger));
  app.use(express.json());
  // The prefix belongs to the service, not to the routing in front of it: the same URL the browser
  // types reaches the same process in development, through the Ingress and behind a reverse proxy.
  // `vite.config.ts` proxies `/api` without rewriting it, and an Ingress route matches on the same
  // prefix — a prefix stripped in one place only is the version of this app that works on a laptop
  // and nowhere else.
  app.use("/api/news", createNewsRouter(service));
  app.use("/health", createHealthRouter());

  return app;
}
