import { randomUUID } from "node:crypto";
import type { Logger } from "@app/agent";
import type { RequestHandler } from "express";

declare global {
  // Express's own extension point: `core.Request` extends this empty interface, so a field added
  // here is a field on every `Request` — no dependency on the types package that declares it.
  namespace Express {
    interface Request {
      /**
       * A logger carrying this request's id.
       *
       * Installed by `requestLog`, which `createApp` puts in front of every route — so a handler can
       * name it without checking, and a handler that runs without the middleware is a bug in `app/`,
       * not a case to guard.
       */
      log: Logger;
    }
  }
}

/**
 * Gives every request an id, and writes one line when it ends.
 *
 * The id is the reason, more than the line is: a research run answers twenty log lines late, and
 * without something to grep for, those lines belong to no request. An `x-request-id` already in
 * flight is kept rather than replaced, because the thing upstream has in its own log is the one
 * worth matching.
 */
export function requestLog(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const id = request.header("x-request-id") ?? randomUUID().slice(0, 8);
    const log = logger.child({ requestId: id });
    const startedAt = Date.now();

    request.log = log;
    response.setHeader("x-request-id", id);

    response.on("finish", () => {
      const fields = {
        method: request.method,
        path: request.originalUrl,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      };

      // A health check polled every ten seconds is not a fact about the service, it is the poller.
      if (request.originalUrl === "/health") {
        log.debug("request", fields);
        return;
      }

      if (response.statusCode >= 500) {
        log.error("request", fields);
        return;
      }

      if (response.statusCode >= 400) {
        log.warn("request", fields);
        return;
      }

      log.info("request", fields);
    });

    next();
  };
}
