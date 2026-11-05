import type { ResearchResult } from "@app/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newsApi } from "#api/news";

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

function stubFetch(response: Response) {
  // The second argument is declared so the assertions can read what was sent, not only what came
  // back; an untyped `vi.fn` forgets the signature of the function it wraps.
  const mock = vi.fn(async (_input: unknown, _init?: RequestInit) => response);

  vi.stubGlobal("fetch", mock);

  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newsApi.research", () => {
  it("posts the request and parses the answer", async () => {
    const mock = stubFetch(new Response(JSON.stringify(result), { status: 200 }));

    const outcome = await newsApi.research({ prompt: "grid batteries", maxSources: 5 });

    expect(outcome).toEqual(result);

    const init = mock.mock.calls[0]?.[1];

    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "grid batteries", maxSources: 5 });
  });

  // The service is another process; a body that lost a field is not an answer to show the user.
  it("refuses an answer the schema does not recognise", async () => {
    stubFetch(new Response(JSON.stringify({ summary: "just a string field" }), { status: 200 }));

    await expect(newsApi.research({ prompt: "grid batteries" })).rejects.toThrow();
  });

  it("carries the service's reason for a refusal", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: "invalid request body",
          fieldErrors: { prompt: ["too short"] },
        }),
        { status: 400 },
      ),
    );

    await expect(newsApi.research({ prompt: "ai" })).rejects.toThrow(
      "invalid request body — prompt: too short",
    );
  });

  it("carries a refusal with no field errors as one sentence", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "the search engine answered 503" }), { status: 502 }),
    );

    await expect(newsApi.research({ prompt: "grid batteries" })).rejects.toThrow(
      "the search engine answered 503",
    );
  });

  // A proxy in front of the service answers 502 with HTML. The status is the only truth left.
  it("falls back to the status when the error body is not the service's", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(newsApi.research({ prompt: "grid batteries" })).rejects.toThrow(
      "POST /api/news failed with 502",
    );
  });
});
