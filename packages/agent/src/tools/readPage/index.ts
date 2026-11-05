import { AgentTool } from "@app/shared";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type AgentConfig, readBearerToken } from "#config";
import { AgentError } from "#errors/agent";
import { crawl4aiMarkdownSchema } from "#schemas/pageRead";
import { AgentFailure, type ReadOutcome } from "#types/agent";

/**
 * The content filters the fetcher offers, in the order worth trying them.
 *
 * A filter that answers an empty page still says `success: true`, so the chain is walked on empty
 * output rather than on a failure flag — the same ladder the pi client climbs.
 */
function filterChain(query: string | undefined): readonly string[] {
  if (query !== undefined) {
    return ["bm25", "fit", "raw"];
  }

  return ["fit", "raw"];
}

/**
 * One page through Crawl4AI: a real browser, JavaScript rendered, converted to markdown.
 *
 * The text is clipped to `maxChars` before it reaches the model. A news page is mostly navigation,
 * cookie walls and related-article lists, and handing all of it over costs the whole context window
 * for the sake of a footer.
 */
export async function readPage(
  config: AgentConfig,
  url: string,
  query?: string,
): Promise<ReadOutcome> {
  const chain = filterChain(query);
  let markdown = "";

  for (const candidate of chain) {
    markdown = await requestMarkdown(config, url, candidate, query);

    if (markdown.trim() !== "") {
      break;
    }
  }

  if (markdown.trim() === "") {
    throw new AgentError(
      AgentFailure.Fetch,
      `the page came back with no readable text: ${url} (paywall, cookie wall, or a page that needs a login)`,
    );
  }

  const clipped = markdown.trim().slice(0, config.crawl4ai.maxChars);

  return {
    kind: "page",
    url,
    title: titleOf(clipped, url),
    markdown: clipped,
    truncated: markdown.trim().length > clipped.length,
  };
}

async function requestMarkdown(
  config: AgentConfig,
  url: string,
  filter: string,
  query: string | undefined,
): Promise<string> {
  const body: Record<string, unknown> = { url, f: filter };

  if (query !== undefined && filter === "bm25") {
    body.q = query;
  }

  const response = await fetch(`${config.crawl4ai.baseUrl}/md`, {
    method: "POST",
    signal: AbortSignal.timeout(config.crawl4ai.timeoutMs),
    // Header names as data, not identifiers: they are wire format, and nothing here owns them.
    headers: {
      authorization: `Bearer ${readBearerToken(config.crawl4ai.tokenFile)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    throw new AgentError(
      AgentFailure.Fetch,
      `the fetcher did not answer: ${config.crawl4ai.baseUrl}`,
      {
        cause: error,
      },
    );
  });

  const text = await response.text();

  if (!response.ok) {
    // The fetcher's SSRF guard answers the same way for a name that does not resolve as for a
    // private address, so the row has to name both possibilities.
    throw new AgentError(
      AgentFailure.Fetch,
      `the fetcher answered ${response.status} for ${url}: ${text.slice(0, 300)}${
        text.toLowerCase().includes("blocked")
          ? " (the name does not resolve, or it points at a private address)"
          : ""
      }`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AgentError(AgentFailure.Fetch, "the fetcher answered something that is not JSON", {
      cause: error,
    });
  }

  return crawl4aiMarkdownSchema.parse(parsed).markdown;
}

/**
 * The page's own headline, or its host.
 *
 * `/md` returns converted text and no metadata, so the first ATX heading is the only title in the
 * response. Falling back to the host keeps a source row honest: it says where the text came from
 * without inventing a headline the page does not carry.
 */
function titleOf(markdown: string, url: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();

  if (heading !== undefined && heading !== "") {
    return heading;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The reading tool as the model sees it. */
export function createReadPageTool(config: AgentConfig) {
  return tool(
    async ({ url, query }) => {
      return readPage(config, url, query);
    },
    {
      name: AgentTool.Read,
      description:
        "Open one URL and get its readable text. Use this before stating anything you took from a search excerpt. `query` keeps only the passages relevant to it, which is worth it on a long page and a waste on a short one.",
      schema: z.object({
        url: z.url().describe("The absolute URL to open"),
        query: z
          .string()
          .min(2)
          .optional()
          .describe("Keep only the parts of the page relevant to these words"),
      }),
    },
  );
}
