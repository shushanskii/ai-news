import type { ResearchResult } from "@app/shared";
import { describe, expect, it } from "vitest";
import {
  clearResult,
  initialState,
  newsReducer,
  setError,
  setResult,
  setRunning,
} from "#reducers/news";

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

describe("newsReducer", () => {
  it("returns the initial state", () => {
    expect(newsReducer(undefined, { type: "@@INIT" })).toEqual(initialState);
  });

  it("raises and lowers the running flag", () => {
    const running = newsReducer(initialState, setRunning(true));

    expect(running.running).toBe(true);
    expect(initialState.running).toBe(false);
    expect(newsReducer(running, setRunning(false)).running).toBe(false);
  });

  it("keeps the answer the service returned", () => {
    const next = newsReducer(initialState, setResult(result));

    expect(next.result).toEqual(result);
    expect(initialState.result).toBeUndefined();
  });

  it("holds an error beside the previous answer", () => {
    const withResult = newsReducer(initialState, setResult(result));
    const failed = newsReducer(withResult, setError("the search engine answered 503"));

    // A failed run must not blank the screen: the answer that was there is still the best
    // information the user has.
    expect(failed.error).toBe("the search engine answered 503");
    expect(failed.result).toEqual(result);
  });

  it("drops the answer and leaves the error alone", () => {
    const filled = newsReducer(newsReducer(initialState, setResult(result)), setError("stale"));
    const cleared = newsReducer(filled, clearResult());

    expect(cleared.result).toBeUndefined();
    expect(cleared.error).toBe("stale");
  });

  // Immer's no-op guarantee is a test contract: a reducer that changes nothing returns the same
  // object, so a component below it does not re-render.
  it("returns the identical state when nothing changes", () => {
    expect(newsReducer(initialState, clearResult())).toBe(initialState);
    expect(newsReducer(initialState, setRunning(false))).toBe(initialState);
    expect(newsReducer(initialState, setError(undefined))).toBe(initialState);
  });
});
