import { AgentError, AgentFailure, createLogger, type Logger, silentLogger } from "@app/agent";
import type { ResearchRequest, ResearchResult } from "@app/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "#app";
import { type NewsService, ResearchTimeout } from "#services/news";

const result: ResearchResult = {
  topic: "grid batteries",
  summary: "Two pilots were announced this month.",
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

function appAnswering(
  research: (request: ResearchRequest) => Promise<ResearchResult>,
  logger: Logger = silentLogger,
) {
  const service: NewsService = { research };

  return createApp(service, logger);
}

describe("POST /api/news", () => {
  it("answers with the digest", async () => {
    const response = await request(appAnswering(async () => result))
      .post("/api/news")
      .send({ prompt: "what is happening with grid batteries" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
  });

  // The defaults are the schema's, so the route has to hand the agent a request that already has
  // them: a run built from a half-filled request is a run with no tools.
  it("fills in the tools and the ceiling before the agent sees the request", async () => {
    const research = vi.fn(async (_request: ResearchRequest) => result);

    await request(appAnswering(research)).post("/api/news").send({ prompt: "grid batteries" });

    expect(research.mock.calls[0]?.[0]).toEqual({
      prompt: "grid batteries",
      tools: ["search_web", "read_page"],
      maxSources: 8,
    });
  });

  it("passes a system prompt and a tool selection through", async () => {
    const research = vi.fn(async (_request: ResearchRequest) => result);

    await request(appAnswering(research))
      .post("/api/news")
      .send({ prompt: "grid batteries", systemPrompt: "Be terse.", tools: ["search_web"] });

    expect(research.mock.calls[0]?.[0]).toMatchObject({
      systemPrompt: "Be terse.",
      tools: ["search_web"],
    });
  });

  it("refuses a prompt too short to search for", async () => {
    const response = await request(appAnswering(async () => result))
      .post("/api/news")
      .send({ prompt: "ai" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid request body");
    // The wording is zod's and changes between versions; that the message names the limit is the
    // part worth pinning.
    expect(response.body.fieldErrors.prompt).toEqual([expect.stringContaining("3")]);
  });

  it("refuses a body with no prompt at all", async () => {
    const response = await request(appAnswering(async () => result))
      .post("/api/news")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.prompt).toBeDefined();
  });

  it("refuses a tool this agent does not have", async () => {
    const response = await request(appAnswering(async () => result))
      .post("/api/news")
      .send({ prompt: "grid batteries", tools: ["browse_instagram"] });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.tools).toBeDefined();
  });

  // A search engine that is down is not the app's failure, and the status has to say so or the
  // operator reads the wrong service's logs.
  it("reports an upstream failure as 502 with the agent's own words", async () => {
    const service = async (): Promise<ResearchResult> => {
      throw new AgentError(AgentFailure.Search, "the search engine answered 503");
    };

    const response = await request(appAnswering(service)).post("/api/news").send({
      prompt: "grid batteries",
    });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain("503");
  });

  // A missing token file is this deployment's bug, not the search engine's.
  it("reports a misconfiguration as 500", async () => {
    const service = async (): Promise<ResearchResult> => {
      throw new AgentError(AgentFailure.Config, "the fetcher token is unreadable");
    };

    const response = await request(appAnswering(service)).post("/api/news").send({
      prompt: "grid batteries",
    });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("token");
  });

  it("reports an abandoned run as 504", async () => {
    const service = async (): Promise<ResearchResult> => {
      throw new ResearchTimeout(300_000);
    };

    const response = await request(appAnswering(service)).post("/api/news").send({
      prompt: "grid batteries",
    });

    expect(response.status).toBe(504);
  });

  it("keeps an unexpected failure's detail out of the response", async () => {
    const lines: string[] = [];

    const service = async (): Promise<ResearchResult> => {
      throw new TypeError("cannot read properties of undefined");
    };

    const response = await request(
      appAnswering(service, createLogger({ write: (line) => lines.push(line) })),
    )
      .post("/api/news")
      .send({ prompt: "grid batteries" });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("the research run failed");
    // The stack trace the operator needs goes to the log; the string the caller sees says nothing.
    expect(
      lines.some((line) => line.includes("research failed") && line.includes("unexpected")),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain("cannot read properties");
  });

  it("answers 404 for a method that does not exist", async () => {
    const response = await request(appAnswering(async () => result)).get("/api/news");

    expect(response.status).toBe(404);
  });
});
