import { createLogger, type Logger } from "@app/agent";
import type { ResearchResult } from "@app/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "#app";
import type { NewsService } from "#services/news";

const result: ResearchResult = {
  topic: "grid batteries",
  summary: "Two pilots were announced.",
  keyPoints: [],
  sources: [],
  queries: [],
  meta: {
    model: "qwen3.8-flash-next",
    steps: 1,
    toolCalls: 0,
    durationMs: 1_000,
    generatedAt: "2026-11-04T10:00:00.000Z",
  },
};

/** Lines the app wrote, newest last. */
function recording(level: "debug" | "info" = "debug") {
  const lines: string[] = [];
  const logger: Logger = createLogger({ level, write: (line) => lines.push(line) });
  const service: NewsService = { research: async () => result };

  return { lines, app: createApp(service, logger) };
}

// The line is written when the response finishes, which is a moment after the client sees the last
// byte. A test that reads the lines synchronously loses that race about once a run.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("requestLog", () => {
  it("answers with an id the caller can quote back", async () => {
    const { app } = recording();

    const response = await request(app).get("/health");

    expect(response.headers["x-request-id"]).toMatch(/[0-9a-f-]{8,}/);
  });

  it("keeps the id a caller already sent", async () => {
    const { app, lines } = recording();

    await request(app).get("/health").set("x-request-id", "trace-42");
    await settle();

    expect(lines.join("\n")).toContain("requestId=trace-42");
  });

  it("writes one line per request, with what it cost", async () => {
    const { app, lines } = recording("info");

    await request(app).post("/api/news").send({ prompt: "grid batteries" });
    await settle();

    // The route logs the request too; the middleware's line is the one carrying a status.
    const line = lines.find((entry) => entry.includes("status=")) ?? "";

    expect(line).toContain("method=POST");
    expect(line).toContain("path=/api/news");
    expect(line).toContain("status=200");
    expect(line).toMatch(/durationMs=\d+/);
  });

  it("keeps a health check out of the log at info", async () => {
    const { app, lines } = recording("info");

    await request(app).get("/health");
    await settle();

    expect(lines).toEqual([]);
  });

  it("calls a 404 and a 400 a warning", async () => {
    const { app, lines } = recording("info");

    await request(app).get("/api/news");
    await request(app).post("/api/news").send({ prompt: "ai" });
    await settle();

    expect(lines.some((line) => line.includes("WARN") && line.includes("status=404"))).toBe(true);
    expect(lines.some((line) => line.includes("WARN") && line.includes("status=400"))).toBe(true);
  });
});
