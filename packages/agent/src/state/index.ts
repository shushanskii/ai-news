import { type ResearchSource, researchSourceSchema } from "@app/shared";
import { MessagesValue, ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { digestSchema } from "#schemas/digest";

/**
 * What a run accumulates.
 *
 * `queries` and `sources` are channels of their own rather than something scraped out of the
 * transcript at the end: the transcript is the model's working memory, and a bibliography read back
 * out of it would carry whatever the model chose to repeat instead of everything that was actually
 * fetched.
 */
export const ResearchState = new StateSchema({
  messages: MessagesValue,

  queries: new ReducedValue(z.array(z.string()).default([]), { reducer: appendUnique }),

  sources: new ReducedValue(z.array(researchSourceSchema).default([]), { reducer: mergeSources }),

  steps: new ReducedValue(z.number().int().min(0).default(0), { reducer: sum }),

  toolCalls: new ReducedValue(z.number().int().min(0).default(0), { reducer: sum }),

  digest: new ReducedValue(digestSchema.nullable().default(null), { reducer: replace }),
});

// The same query twice is the model failing to rephrase, not a second search worth reporting.
function appendUnique(previous: readonly string[], next: readonly string[]): readonly string[] {
  return [...new Set([...previous, ...next])];
}

/**
 * Merge two batches of sources by URL.
 *
 * A page seen in a search result and later opened must come back as one row that says it was read,
 * not two rows — and the stronger claim wins, because `read: true` is what the agent actually did.
 */
function mergeSources(
  previous: readonly ResearchSource[],
  next: readonly ResearchSource[],
): readonly ResearchSource[] {
  const merged = new Map<string, ResearchSource>();

  for (const source of [...previous, ...next]) {
    const seen = merged.get(source.url);

    merged.set(source.url, {
      url: source.url,
      title: source.title !== "" ? source.title : (seen?.title ?? ""),
      ...(source.snippet !== undefined
        ? { snippet: source.snippet }
        : seen?.snippet !== undefined
          ? { snippet: seen.snippet }
          : {}),
      read: seen?.read === true || source.read,
    });
  }

  return [...merged.values()];
}

function sum(previous: number, next: number): number {
  return previous + next;
}

function replace<T>(_previous: T, next: T): T {
  return next;
}
