import { type Logger, runResearch } from "@app/agent";
import type { ResearchRequest, ResearchResult } from "@app/shared";

/** How long one research run may take before the service stops waiting. */
export const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Raised when a run outlives the service's patience.
 *
 * A separate type because the answer to the caller differs: an `AgentError` says the agent failed
 * for a reason worth reading, while this says the request was abandoned and the same question may
 * well succeed if asked again with a narrower topic.
 */
export class ResearchTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`the research run was abandoned after ${timeoutMs}ms`);
    this.name = "ResearchTimeout";
  }
}

/** The part of the agent the service talks to — the seam a test replaces. */
export type ResearchRunner = (request: ResearchRequest, logger: Logger) => Promise<ResearchResult>;

export interface NewsService {
  readonly research: (request: ResearchRequest, logger: Logger) => Promise<ResearchResult>;
}

export interface NewsServiceOptions {
  readonly runner?: ResearchRunner;
  readonly timeoutMs?: number;
}

const defaultRunner: ResearchRunner = (request, logger) => runResearch(request, { logger });

/**
 * The service behind `POST /api/news`.
 *
 * Two seams, both for the same reason: a route test should not need a model, a search engine and a
 * browser to prove that a request body turns into a response. `runner` is the agent, `timeoutMs`
 * is the clock.
 *
 * The timeout exists because a research run is a chain of things that can stall — a search engine
 * that hangs, a page behind a wall — and a browser waiting on a request that will never answer is
 * worse than an answer that says "ask again".
 *
 * The service owns no logger: the request's own logger arrives with the request, which is what lets
 * a log line say which of the twenty concurrent runs it belongs to.
 */
export function createNewsService(options: NewsServiceOptions = {}): NewsService {
  const runner = options.runner ?? defaultRunner;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function research(request: ResearchRequest, logger: Logger): Promise<ResearchResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ResearchTimeout(timeoutMs)), timeoutMs);
      // A pending timer would keep the process alive after `close` in a test.
      timer.unref?.();
    });

    try {
      // `Promise.race` stops the service from waiting, not the run: the agent keeps going until its
      // own ceilings end it. Cancelling mid-run is a different feature and needs the agent to
      // accept a signal.
      return await Promise.race([runner(request, logger), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { research };
}
