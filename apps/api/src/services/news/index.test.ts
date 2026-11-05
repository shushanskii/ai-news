import { AgentError, AgentFailure, type Logger, silentLogger } from "@app/agent";
import type { ResearchRequest, ResearchResult } from "@app/shared";
import { describe, expect, it, vi } from "vitest";
import { createNewsService, ResearchTimeout } from "#services/news";

const result: ResearchResult = {
  topic: "grid batteries",
  summary: "Two pilots were announced.",
  keyPoints: ["One plant is scheduled for 2027."],
  sources: [{ url: "https://example.com/a", title: "Headline", read: true }],
  queries: ["grid batteries news"],
  meta: {
    model: "qwen3.8-flash-next",
    steps: 3,
    toolCalls: 2,
    durationMs: 12_000,
    generatedAt: "2026-11-04T10:00:00.000Z",
  },
};

describe("createNewsService", () => {
  it("hands the request and the request's logger to the agent", async () => {
    const runner = vi.fn(async (_request: ResearchRequest, _logger: Logger) => result);
    const service = createNewsService({ runner });
    const request: ResearchRequest = { prompt: "grid batteries" };

    await expect(service.research(request, silentLogger)).resolves.toBe(result);
    expect(runner).toHaveBeenCalledWith(request, silentLogger);
  });

  it("passes an agent failure through untouched", async () => {
    const service = createNewsService({
      runner: async () => {
        throw new AgentError(AgentFailure.Search, "the search engine refused the query");
      },
    });

    const error = (await service
      .research({ prompt: "grid batteries" }, silentLogger)
      .catch((caught: unknown) => caught)) as AgentError;

    expect(error).toBeInstanceOf(AgentError);
    expect(error.failure).toBe(AgentFailure.Search);
  });

  // A run that never answers must not become a request that never answers.
  it("gives up on a run that outlives the deadline", async () => {
    const service = createNewsService({
      runner: () => new Promise<ResearchResult>(() => undefined),
      timeoutMs: 10,
    });

    const error = (await service
      .research({ prompt: "grid batteries" }, silentLogger)
      .catch((caught: unknown) => caught)) as Error;

    expect(error).toBeInstanceOf(ResearchTimeout);
    expect(error.message).toContain("10ms");
  });

  it("does not time out a run that answers in time", async () => {
    const service = createNewsService({
      timeoutMs: 500,
      runner: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));

        return result;
      },
    });

    await expect(service.research({ prompt: "grid batteries" }, silentLogger)).resolves.toBe(
      result,
    );
  });
});
