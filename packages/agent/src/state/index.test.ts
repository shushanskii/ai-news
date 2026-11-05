import type { ResearchSource } from "@app/shared";
import { describe, expect, it } from "vitest";
import { ResearchState } from "#state";

// The reducers are what the graph runs on every update, so they are tested here rather than
// through a compiled graph: same function, no model and no network in the way.
const { queries, sources, steps, digest } = ResearchState.fields;

function source(url: string, title: string, read: boolean, snippet?: string): ResearchSource {
  return { url, title, ...(snippet === undefined ? {} : { snippet }), read };
}

describe("sources channel", () => {
  it("keeps one row per url", () => {
    const merged = sources.reducer(
      [source("https://a", "Headline", false)],
      [source("https://a", "Headline", true)],
    );

    expect(merged).toHaveLength(1);
  });

  // A page seen in a result list and later opened was read; the weaker row must not survive and
  // make the answer look less checked than it was.
  it("lets the stronger claim about reading win", () => {
    const merged = sources.reducer(
      [source("https://a", "Headline", true, "from the page")],
      [source("https://a", "Headline", false, "from the excerpt")],
    );

    expect(merged[0]?.read).toBe(true);
  });

  it("keeps an earlier snippet when the later row has none", () => {
    const merged = sources.reducer(
      [source("https://a", "Headline", false, "an excerpt")],
      [source("https://a", "Headline", true)],
    );

    expect(merged[0]?.snippet).toBe("an excerpt");
  });

  it("takes a headline that arrives filled in", () => {
    const merged = sources.reducer(
      [source("https://a", "news.example.org", false)],
      [source("https://a", "The real headline", true)],
    );

    expect(merged[0]?.title).toBe("The real headline");
  });

  it("keeps the order the pages were seen in", () => {
    const merged = sources.reducer(
      [source("https://a", "A", false)],
      [source("https://b", "B", false), source("https://c", "C", true)],
    );

    expect(merged.map((row) => row.url)).toEqual(["https://a", "https://b", "https://c"]);
  });
});

describe("queries channel", () => {
  it("appends a new query", () => {
    expect(queries.reducer(["first"], ["second"])).toEqual(["first", "second"]);
  });

  // The same query twice is the model failing to rephrase, and reporting it twice would make the
  // run look more thorough than it was.
  it("ignores a query that was already run", () => {
    expect(queries.reducer(["first"], ["first"])).toEqual(["first"]);
  });
});

describe("counters", () => {
  it("adds each round trip", () => {
    expect(steps.reducer(2, 1)).toBe(3);
  });

  it("starts from zero rather than replacing", () => {
    expect(steps.reducer(0, 1)).toBe(1);
  });
});

describe("digest channel", () => {
  it("replaces whatever was there", () => {
    const written = { topic: "t", summary: "s", keyPoints: [], sources: [] };

    expect(digest.reducer(null, written)).toBe(written);
  });
});
