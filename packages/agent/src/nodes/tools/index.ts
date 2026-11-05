import type { ResearchSource } from "@app/shared";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { GraphNode } from "@langchain/langgraph";
import { toMessage } from "#errors/agent";
import { type Logger, silentLogger } from "#logging";
import type { ResearchState } from "#state";
import type { AgentToolLike, ReadOutcome, SearchOutcome, ToolOutcome } from "#types/agent";

/** How much of a page is kept as its description in the bibliography. */
const SNIPPET_CHARS = 220;

/**
 * Runs whatever the model asked for and answers it as a `ToolMessage` per call.
 *
 * Written by hand instead of using LangGraph's prebuilt tool node because the run keeps a second
 * record of what the tools returned: the bibliography and the query list are built here, from the
 * typed outcome, and not scraped out of the text the model reads.
 */
export function createToolsNode(
  tools: readonly AgentToolLike[],
  logger: Logger = silentLogger,
): GraphNode<typeof ResearchState> {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return async (state) => {
    const last = state.messages.at(-1);
    const calls = last !== undefined && AIMessage.isInstance(last) ? (last.tool_calls ?? []) : [];

    const messages: ToolMessage[] = [];
    const sources: ResearchSource[] = [];
    const queries: string[] = [];

    for (const call of calls) {
      const tool = byName.get(call.name);

      // A model that asks for a tool the request did not allow is told so, and told what exists.
      // Refusing the whole run here would turn one bad call into a failed request.
      if (tool === undefined) {
        logger.warn("tool unknown", { tool: call.name, allowed: [...byName.keys()] });
        messages.push(
          errorReply(call.id ?? "", call.name, `this agent has no tool named "${call.name}"`),
        );
        continue;
      }

      const startedAt = Date.now();

      try {
        const outcome = await tool.invoke(call.args ?? {});
        const content = formatOutcome(outcome);

        logger.info("tool call", {
          tool: call.name,
          ...fieldsOf(outcome),
          durationMs: Date.now() - startedAt,
        });

        messages.push(
          new ToolMessage({
            content,
            // biome-ignore lint/style/useNamingConvention: the wire field of LangChain's ToolMessage
            tool_call_id: call.id ?? "",
            name: call.name,
            status: "success",
          }),
        );

        sources.push(...sourcesOf(outcome));

        if (outcome.kind === "search") {
          queries.push(outcome.query);
        }
      } catch (error) {
        // The failure goes back to the model as text: "that page is behind a cookie wall" is
        // actionable, and the next call is usually a different URL.
        logger.warn("tool failed", {
          tool: call.name,
          reason: toMessage(error),
          durationMs: Date.now() - startedAt,
        });
        messages.push(errorReply(call.id ?? "", call.name, toMessage(error)));
      }
    }

    return { messages, sources, queries, toolCalls: calls.length };
  };
}

function errorReply(toolCallId: string, name: string, reason: string): ToolMessage {
  return new ToolMessage({
    content: `${name} failed: ${reason}`,
    // biome-ignore lint/style/useNamingConvention: the wire field of LangChain's ToolMessage
    tool_call_id: toolCallId,
    name,
    status: "error",
  });
}

/**
 * What one call is worth knowing afterwards, in the log.
 *
 * Counts and an address, never the payload: a page of markdown in a log line pushes the six lines
 * that explain it off the screen, and `debug` already has the transcript.
 */
function fieldsOf(outcome: ToolOutcome): Record<string, unknown> {
  return outcome.kind === "search"
    ? { query: outcome.query, hits: outcome.hits.length }
    : { url: outcome.url, chars: outcome.markdown.length, truncated: outcome.truncated };
}

/** The text the model reads. Compact, because every page read is paid for in context. */
function formatOutcome(outcome: ToolOutcome): string {
  return outcome.kind === "search" ? formatSearch(outcome) : formatPage(outcome);
}

function formatSearch(outcome: SearchOutcome): string {
  if (outcome.hits.length === 0) {
    return `Nothing found for "${outcome.query}". Search again with different words before giving up on the topic.`;
  }

  const lines = [`Search "${outcome.query}" — ${outcome.hits.length} results:`];

  for (const [index, hit] of outcome.hits.entries()) {
    lines.push(`${index + 1}. ${hit.title}`, `   ${hit.url}`);

    if (hit.publishedAt !== undefined) {
      lines.push(`   published: ${hit.publishedAt}`);
    }

    if (hit.snippet !== "") {
      lines.push(`   ${hit.snippet}`);
    }
  }

  return lines.join("\n");
}

function formatPage(outcome: ReadOutcome): string {
  const head = [`Page "${outcome.title}"`, `URL: ${outcome.url}`];

  if (outcome.truncated) {
    head.push("(the page is longer than this excerpt; the end was cut)");
  }

  return `${head.join("\n")}\n\n${outcome.markdown}`;
}

/**
 * What a call adds to the bibliography.
 *
 * Search hits enter as unread; only a page that came back through the fetcher is marked `read`.
 * That distinction is the difference between "the agent checked" and "the agent saw a headline",
 * and the answer loses it the moment both are recorded the same way.
 */
function sourcesOf(outcome: ToolOutcome): readonly ResearchSource[] {
  if (outcome.kind === "search") {
    return outcome.hits.map((hit) => ({
      url: hit.url,
      title: hit.title,
      ...(hit.snippet === "" ? {} : { snippet: hit.snippet }),
      read: false,
    }));
  }

  return [
    {
      url: outcome.url,
      title: outcome.title,
      ...(() => {
        const snippet = firstParagraph(outcome.markdown);

        return snippet === undefined ? {} : { snippet };
      })(),
      read: true,
    },
  ];
}

/** The first prose paragraph, skipping headings and link lists. */
function firstParagraph(markdown: string): string | undefined {
  for (const block of markdown.split(/\n\s*\n/)) {
    const text = block.trim();

    if (text === "" || text.startsWith("#") || text.startsWith("!") || text.startsWith("[")) {
      continue;
    }

    return text.replace(/\s+/g, " ").slice(0, SNIPPET_CHARS);
  }

  return undefined;
}
