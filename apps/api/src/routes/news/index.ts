import { AgentError, AgentFailure } from "@app/agent";
import { researchRequestSchema } from "@app/shared";
import { type Request, type Response, Router } from "express";
import { type ZodError, z } from "zod";
import { type NewsService, ResearchTimeout } from "#services/news";

function badRequest(res: Response, error: ZodError, subject: string): void {
  const { formErrors, fieldErrors } = z.flattenError(error);

  res.status(400).json({ error: `invalid ${subject}`, formErrors, fieldErrors });
}

/**
 * Who to blame for a failed run, and what status that is worth.
 *
 * A misconfiguration is this process's fault (500); a search engine, a fetcher or a model that
 * refused is somebody else's (502); a run that outlived the deadline is neither and says so (504).
 * Collapsing the three into 500 is what makes an operator read the app's logs for a search engine
 * that is down.
 */
function failed(request: Request, res: Response, error: unknown): void {
  if (error instanceof ResearchTimeout) {
    request.log.warn("research abandoned", { reason: error.message });
    res.status(504).json({ error: error.message });
    return;
  }

  if (error instanceof AgentError) {
    const status = error.failure === AgentFailure.Config ? 500 : 502;

    request.log.error("research failed", { failure: error.failure, reason: error.message });
    res.status(status).json({ error: error.message });
    return;
  }

  // Anything else is a bug, and the message that would help is the stack trace — which belongs in
  // the log, not in a response body a browser shows the user.
  request.log.error("research failed", { failure: "unexpected", reason: error });
  res.status(500).json({ error: "the research run failed" });
}

export function createNewsRouter(service: NewsService): Router {
  async function handleResearch(request: Request, response: Response): Promise<void> {
    const parsed = researchRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      badRequest(response, parsed.error, "request body");
      return;
    }

    request.log.info("research requested", {
      prompt: parsed.data.prompt,
      maxSources: parsed.data.maxSources,
    });

    try {
      response.json(await service.research(parsed.data, request.log));
    } catch (error) {
      failed(request, response, error);
    }
  }

  const router = Router();

  // One route, and it is a question rather than a resource: the same topic asked twice is two
  // answers, not one record, so there is nothing to `GET /:id` and nothing to delete.
  router.post("/", handleResearch);

  return router;
}
