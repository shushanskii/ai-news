import { AgentTool } from "@app/shared";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentConfig } from "#config";
import { AgentError } from "#errors/agent";
import { searxngResponseSchema } from "#schemas/searchHit";
import { AgentFailure, type SearchOutcome } from "#types/agent";

/** How far back the engine may look. The spellings are SearXNG's own. */
const timeRangeSchema = z.enum(["day", "week", "month", "year"]);

export type TimeRange = z.infer<typeof timeRangeSchema>;

export interface SearchOptions {
  readonly timeRange?: TimeRange;
  readonly limit?: number;
}

/**
 * One query against the SearXNG instance behind `format=json`.
 *
 * Zero hits is a result, not a failure: the honest answer to a bad query is an empty list, which is
 * what makes the model rephrase it instead of giving up on the topic.
 */
export async function searchSearxng(
  config: AgentConfig,
  query: string,
  options: SearchOptions = {},
): Promise<SearchOutcome> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: config.searxng.category,
  });

  if (options.timeRange !== undefined) {
    params.set("time_range", options.timeRange);
  }

  const limit = options.limit ?? config.searxng.maxResults;

  const response = await fetch(`${config.searxng.baseUrl}/search?${params}`, {
    signal: AbortSignal.timeout(config.searxng.timeoutMs),
    headers: { accept: "application/json" },
  }).catch((error: unknown) => {
    throw new AgentError(
      AgentFailure.Search,
      `the search engine did not answer: ${config.searxng.baseUrl}`,
      {
        cause: error,
      },
    );
  });

  const body = await response.text();

  if (!response.ok) {
    // The instance answers 403 when `json` is not in `enabled_formats`, which reads as a refusal
    // to search and is really a configuration gap on that box.
    throw new AgentError(
      AgentFailure.Search,
      `the search engine answered ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new AgentError(
      AgentFailure.Search,
      "the search engine answered something that is not JSON",
      {
        cause: error,
      },
    );
  }

  const outcome = searxngResponseSchema.parse(parsed);

  if (outcome.error !== undefined) {
    throw new AgentError(
      AgentFailure.Search,
      `the search engine refused the query: ${outcome.error}`,
    );
  }

  return {
    kind: "search",
    query,
    hits: outcome.hits.slice(0, limit),
  };
}

/** The search tool as the model sees it. */
export function createSearchWebTool(config: AgentConfig) {
  return tool(
    async ({ query, timeRange, limit }) => {
      return searchSearxng(config, query, {
        ...(timeRange === undefined ? {} : { timeRange }),
        ...(limit === undefined ? {} : { limit }),
      });
    },
    {
      name: AgentTool.Search,
      description:
        "Search the web and get ranked results with a short excerpt each. This finds pages, it does not read them: an excerpt is a headline, and a digest written from excerpts alone repeats whatever the aggregator got wrong. Use `timeRange` when the request is about recent events.",
      schema: z.object({
        query: z.string().min(2).describe("Words to search for, not a full sentence"),
        timeRange: timeRangeSchema
          .optional()
          .describe("Restrict to the recent past: day, week, month or year"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("How many results to return, default 8"),
      }),
    },
  );
}
