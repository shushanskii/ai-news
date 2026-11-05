import { afterEach, describe, expect, it, vi } from "vitest";
import { type AgentConfig, loadConfig } from "#config";
import { searchSearxng } from "#tools/searchWeb";
import { AgentFailure } from "#types/agent";

type Fetch = (input: unknown, init?: RequestInit) => Promise<Response>;

/** Stands in for the network and keeps the arguments of the call readable to the assertions. */
function stubFetch(handler: Fetch) {
  const mock = vi.fn(handler);

  vi.stubGlobal("fetch", mock);

  return mock;
}

function config(overrides: Partial<AgentConfig["searxng"]> = {}): AgentConfig {
  const base = loadConfig({});

  return { ...base, searxng: { ...base.searxng, ...overrides } };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The URL the engine was actually asked. */
function askedUrl(mock: ReturnType<typeof stubFetch>): URL {
  return new URL(String(mock.mock.calls[0]?.[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchSearxng", () => {
  it("asks the engine for json in the configured category", async () => {
    const mock = stubFetch(async () => json({ results: [] }));

    await searchSearxng(config({ category: "news" }), "grid batteries", { timeRange: "week" });

    const url = askedUrl(mock);

    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("categories")).toBe("news");
    expect(url.searchParams.get("time_range")).toBe("week");
  });

  it("leaves the time range off the query when the model did not ask for one", async () => {
    const mock = stubFetch(async () => json({ results: [] }));

    await searchSearxng(config(), "grid batteries");

    expect(askedUrl(mock).searchParams.has("time_range")).toBe(false);
  });

  it("keeps the headline, the url and the excerpt of every hit", async () => {
    stubFetch(async () =>
      json({
        results: [
          {
            url: "https://example.com/a",
            title: "Plant opens",
            content: "A line from the article.",
            // biome-ignore lint/style/useNamingConvention: the field SearXNG answers with
            published_date: "2026-11-02",
          },
        ],
      }),
    );

    const outcome = await searchSearxng(config(), "grid batteries");

    expect(outcome).toEqual({
      kind: "search",
      query: "grid batteries",
      hits: [
        {
          url: "https://example.com/a",
          title: "Plant opens",
          snippet: "A line from the article.",
          publishedAt: "2026-11-02",
        },
      ],
    });
  });

  // An excerpt the engine answers with `null` is still a hit; the row is about the page, not about
  // whether the engine had a summary of it.
  it("treats a missing excerpt as an empty one", async () => {
    stubFetch(async () => json({ results: [{ url: "https://example.com/a", title: "A" }] }));

    const outcome = await searchSearxng(config(), "q");

    expect(outcome.hits[0]?.snippet).toBe("");
    expect(outcome.hits[0]?.publishedAt).toBeUndefined();
  });

  it("drops a row it cannot read as a hit instead of failing the search", async () => {
    stubFetch(async () =>
      json({
        results: [
          { url: "not-a-url", title: "Broken" },
          { url: "https://example.com/a", title: "Fine" },
        ],
      }),
    );

    const outcome = await searchSearxng(config(), "q");

    expect(outcome.hits).toHaveLength(1);
    expect(outcome.hits[0]?.title).toBe("Fine");
  });

  it("returns the number of hits the caller asked for", async () => {
    stubFetch(async () =>
      json({
        results: [1, 2, 3, 4].map((n) => ({
          url: `https://example.com/${n}`,
          title: `Headline ${n}`,
        })),
      }),
    );

    expect((await searchSearxng(config(), "q", { limit: 2 })).hits).toHaveLength(2);
    expect((await searchSearxng(config({ maxResults: 3 }), "q")).hits).toHaveLength(3);
  });

  // Zero hits is an answer, not a failure: the model has to be able to rephrase rather than abort.
  it("reports an empty result list without throwing", async () => {
    stubFetch(async () => json({ results: [] }));

    await expect(searchSearxng(config(), "q")).resolves.toMatchObject({ hits: [] });
  });

  it("reports a refusal from the engine as a search failure", async () => {
    stubFetch(async () => json({ error: "no such category" }));

    const error = (await searchSearxng(config(), "q").catch(
      (caught: unknown) => caught,
    )) as Error & {
      failure: string;
    };

    expect(error).toBeInstanceOf(Error);
    expect(error.failure).toBe(AgentFailure.Search);
    expect(error.message).toContain("no such category");
  });

  // 403 is what an instance with `json` missing from enabled_formats answers, and it reads as a
  // refusal to search rather than as a configuration gap.
  it("reports a non-2xx with the status and the body", async () => {
    stubFetch(async () => new Response("format not allowed", { status: 403 }));

    const error = (await searchSearxng(config(), "q").catch((caught: unknown) => caught)) as Error;

    expect(error.message).toContain("403");
    expect(error.message).toContain("format not allowed");
  });

  it("reports an answer that is not json", async () => {
    stubFetch(async () => new Response("<html>waf</html>"));

    const error = (await searchSearxng(config(), "q").catch((caught: unknown) => caught)) as Error;

    expect(error.message).toContain("not JSON");
  });
});
