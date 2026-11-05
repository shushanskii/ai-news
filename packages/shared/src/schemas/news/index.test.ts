import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  researchRequestSchema,
  researchResultSchema,
  researchSourceSchema,
} from "#schemas/news";
import { AgentTool } from "#types/news";

const source = {
  url: "https://example.com/article",
  title: "A headline",
  read: true,
};

const result = {
  topic: "solid-state batteries",
  summary: "Two pilots were announced this month.",
  keyPoints: ["One plant is scheduled for 2027."],
  sources: [source],
  queries: ["solid-state battery news"],
  meta: {
    model: "qwen3.8-flash-next",
    steps: 4,
    toolCalls: 3,
    durationMs: 12_000,
    generatedAt: "2026-11-04T10:00:00.000Z",
  },
};

describe("researchRequestSchema", () => {
  it("trims the prompt", () => {
    expect(
      researchRequestSchema.safeParse({ prompt: "  quantum error correction  " }).data,
    ).toEqual({
      prompt: "quantum error correction",
      tools: [AgentTool.Search, AgentTool.Read],
      maxSources: 8,
    });
  });

  // A one-word prompt gives the agent nothing to search for, and the run costs a minute of browser
  // time to say so.
  it("rejects a prompt too short to search for", () => {
    expect(researchRequestSchema.safeParse({ prompt: "ai" }).success).toBe(false);
    expect(researchRequestSchema.safeParse({}).success).toBe(false);
  });

  it("offers both retrieval tools when the caller names none", () => {
    expect(researchRequestSchema.safeParse({ prompt: "fusion startups" }).data?.tools).toEqual([
      AgentTool.Search,
      AgentTool.Read,
    ]);
  });

  // A request that selects no tool is a research agent with no way to research: it would answer
  // from the model's own memory and still call that "research".
  it("rejects an empty tool selection", () => {
    expect(researchRequestSchema.safeParse({ prompt: "x y z", tools: [] }).success).toBe(false);
  });

  it("rejects a tool the agent does not have", () => {
    expect(
      researchRequestSchema.safeParse({ prompt: "x y z", tools: ["browse_instagram"] }).success,
    ).toBe(false);
  });

  it("rejects the same tool listed twice", () => {
    expect(
      researchRequestSchema.safeParse({
        prompt: "x y z",
        tools: [AgentTool.Search, AgentTool.Search],
      }).success,
    ).toBe(false);
  });

  it("keeps the bibliography ceiling inside a range", () => {
    expect(
      researchRequestSchema.safeParse({ prompt: "x y z", maxSources: 3 }).data?.maxSources,
    ).toBe(3);
    expect(researchRequestSchema.safeParse({ prompt: "x y z", maxSources: 0 }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ prompt: "x y z", maxSources: 21 }).success).toBe(
      false,
    );
    expect(researchRequestSchema.safeParse({ prompt: "x y z", maxSources: 2.5 }).success).toBe(
      false,
    );
  });

  // An empty system prompt reads as "no instructions" to a human and as nothing at all to the
  // model; the two differ, so the schema refuses the string instead of choosing for the caller.
  it("rejects a blank system prompt", () => {
    expect(researchRequestSchema.safeParse({ prompt: "x y z", systemPrompt: "   " }).success).toBe(
      false,
    );
  });
});

describe("researchSourceSchema", () => {
  it("accepts a source with no snippet", () => {
    expect(researchSourceSchema.safeParse(source).success).toBe(true);
  });

  // `read` is the difference between "the agent read this" and "the agent saw this in a list", and
  // a source that omits it would let the reader assume the stronger claim.
  it("requires the flag that says whether the page was read", () => {
    expect(researchSourceSchema.safeParse({ url: source.url, title: source.title }).success).toBe(
      false,
    );
  });

  it("rejects a url that is not one", () => {
    expect(researchSourceSchema.safeParse({ ...source, url: "example.com" }).success).toBe(false);
  });
});

describe("researchResultSchema", () => {
  it("accepts a complete result", () => {
    expect(researchResultSchema.safeParse(result).success).toBe(true);
  });

  it("accepts a run that found nothing to cite", () => {
    expect(
      researchResultSchema.safeParse({ ...result, keyPoints: [], sources: [], queries: [] })
        .success,
    ).toBe(true);
  });

  it("rejects a timestamp that is only a calendar date", () => {
    expect(
      researchResultSchema.safeParse({
        ...result,
        meta: { ...result.meta, generatedAt: "2026-11-04" },
      }).success,
    ).toBe(false);
  });

  it("rejects a negative step count", () => {
    expect(
      researchResultSchema.safeParse({ ...result, meta: { ...result.meta, steps: -1 } }).success,
    ).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("accepts a bare message", () => {
    expect(apiErrorSchema.safeParse({ error: "invalid request body" }).success).toBe(true);
  });

  it("accepts flattened field errors alongside it", () => {
    const parsed = apiErrorSchema.safeParse({
      error: "invalid request body",
      fieldErrors: { prompt: ["too short"] },
    });

    expect(parsed.success).toBe(true);
  });
});
