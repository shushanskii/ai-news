import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AgentConfig, loadConfig } from "#config";
import { readPage } from "#tools/readPage";
import { AgentFailure } from "#types/agent";

type Fetch = (input: unknown, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: Fetch) {
  const mock = vi.fn(handler);

  vi.stubGlobal("fetch", mock);

  return mock;
}

const tokenFile = join(mkdtempSync(join(tmpdir(), "agent-token-")), "c4a.token");

writeFileSync(tokenFile, "  secret-token\n", { mode: 0o600 });

function config(overrides: Partial<AgentConfig["crawl4ai"]> = {}): AgentConfig {
  const base = loadConfig({});

  return { ...base, crawl4ai: { ...base.crawl4ai, tokenFile, ...overrides } };
}

function markdown(text: string): Response {
  return new Response(JSON.stringify({ success: true, markdown: text }), { status: 200 });
}

/** The bodies of every `/md` call the fetcher received, in order. */
function requests(mock: ReturnType<typeof stubFetch>): readonly Record<string, unknown>[] {
  return mock.mock.calls.map(
    (call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
  );
}

/** Answers only the filter named, so the ladder has something to climb past. */
function onlyFilter(hasText: string): Fetch {
  return async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { f: string };

    return markdown(body.f === hasText ? "Text from the fallback." : "   ");
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readPage", () => {
  it("sends the fetcher token read from the file", async () => {
    const mock = stubFetch(async () => markdown("# Headline\n\nBody."));

    await readPage(config(), "https://example.com/a");

    const headers = mock.mock.calls[0]?.[1]?.headers as Record<string, string>;

    expect(headers.authorization).toBe("Bearer secret-token");
  });

  it("asks for the readable-text filter first", async () => {
    const mock = stubFetch(async () => markdown("Body."));

    await readPage(config(), "https://example.com/a");

    expect(requests(mock)).toEqual([{ url: "https://example.com/a", f: "fit" }]);
  });

  // A content filter answers an empty page with success, so the ladder is climbed on empty output.
  it("falls through the filters until one returns text", async () => {
    const mock = stubFetch(onlyFilter("raw"));

    const outcome = await readPage(config(), "https://example.com/a", "topic");

    expect(requests(mock).map((body) => body.f)).toEqual(["bm25", "fit", "raw"]);
    expect(outcome.markdown).toContain("fallback");
  });

  it("passes the query only to the filter that understands it", async () => {
    const mock = stubFetch(onlyFilter("fit"));

    await readPage(config(), "https://example.com/a", "batteries");

    const [bm25, fit] = requests(mock);

    expect(bm25?.q).toBe("batteries");
    expect(fit?.q).toBeUndefined();
  });

  it("says so when no filter found any text", async () => {
    stubFetch(async () => markdown(""));

    const error = (await readPage(config(), "https://example.com/paywalled").catch(
      (caught: unknown) => caught,
    )) as Error & { failure: string };

    expect(error.failure).toBe(AgentFailure.Fetch);
    expect(error.message).toContain("https://example.com/paywalled");
  });

  it("takes the headline from the page's own first heading", async () => {
    stubFetch(async () => markdown("intro line\n\n# The Headline\n\nBody."));

    expect((await readPage(config(), "https://example.com/a")).title).toBe("The Headline");
  });

  // Without a heading the host is all the page says about itself, and a made-up headline would be
  // a claim the source never made.
  it("falls back to the host when the page has no heading", async () => {
    stubFetch(async () => markdown("Just prose, no heading."));

    expect((await readPage(config(), "https://news.example.org/a")).title).toBe("news.example.org");
  });

  it("clips the page to the configured budget and says it did", async () => {
    stubFetch(async () => markdown("x".repeat(500)));

    const kept = await readPage(config({ maxChars: 100 }), "https://example.com/a");

    expect(kept.markdown).toHaveLength(100);
    expect(kept.truncated).toBe(true);

    const whole = await readPage(config({ maxChars: 1000 }), "https://example.com/a");

    expect(whole.truncated).toBe(false);
  });

  it("reports a refusal from the fetcher with the status and the body", async () => {
    stubFetch(async () => new Response("URL blocked", { status: 400 }));

    const error = (await readPage(config(), "https://127.0.0.1/x").catch(
      (caught: unknown) => caught,
    )) as Error;

    expect(error.message).toContain("400");
    // The guard answers the same way for a name that does not resolve, and the reader has to be
    // told which of the two to go and check.
    expect(error.message).toContain("does not resolve");
  });
});
