import type { ResearchSource } from "@app/shared";
import { describe, expect, it } from "vitest";
import { bibliography } from "#bibliography";
import type { DigestDraft } from "#types/agent";

function source(url: string, read: boolean): ResearchSource {
  return { url, title: `Page ${url}`, read };
}

function digest(citations: readonly string[]): DigestDraft {
  return {
    topic: "batteries",
    summary: "…",
    keyPoints: [],
    sources: citations.map((url) => ({ url, title: `Page ${url}` })),
  };
}

describe("bibliography", () => {
  it("puts the cited pages first, in the order the digest cited them", () => {
    const seen = [source("https://a", false), source("https://b", true), source("https://c", true)];

    // Ceiling of two so the assertion is about order alone, with nothing filling the tail.
    expect(bibliography(seen, digest(["https://c", "https://b"]), 2).map((s) => s.url)).toEqual([
      "https://c",
      "https://b",
    ]);
  });

  it("fills the remaining places with pages the digest did not cite, read ones first", () => {
    const seen = [
      source("https://unread", false),
      source("https://read", true),
      source("https://cited", false),
    ];

    expect(bibliography(seen, digest(["https://cited"]), 3).map((s) => s.url)).toEqual([
      "https://cited",
      "https://read",
      "https://unread",
    ]);
  });

  it("stops at the ceiling the request set", () => {
    const seen = [source("https://a", true), source("https://b", true), source("https://c", true)];

    expect(bibliography(seen, digest([]), 2)).toHaveLength(2);
  });

  // The prompt forbids inventing a URL. A run that disobeyed is exactly the run where the citation
  // cannot be trusted, and a source list is the part a reader checks by hand.
  it("drops a citation for a page no tool ever returned", () => {
    const seen = [source("https://real", true)];

    expect(
      bibliography(seen, digest(["https://invented.example.com"]), 8).map((s) => s.url),
    ).toEqual(["https://real"]);
  });

  it("lists a page once even when the digest cites it twice", () => {
    const seen = [source("https://a", true)];

    expect(bibliography(seen, digest(["https://a", "https://a"]), 8)).toHaveLength(1);
  });

  it("keeps the read flag the tool recorded rather than anything the digest implied", () => {
    const seen = [source("https://snippet-only", false)];

    expect(bibliography(seen, digest(["https://snippet-only"]), 8)[0]?.read).toBe(false);
  });

  it("returns nothing when the agent saw nothing", () => {
    expect(bibliography([], digest(["https://invented"]), 8)).toEqual([]);
  });
});
