import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { GraphNode } from "@langchain/langgraph";
import { AgentError, toMessage } from "#errors/agent";
import { type Logger, silentLogger } from "#logging";
import type { ResearchState } from "#state";
import { AgentFailure, type DigestModel } from "#types/agent";

const DIGEST_INSTRUCTION = `Write the digest now, from the pages you opened above.

- Cite only URLs that appeared in your results. If you opened no page, say so in the summary and list no sources.
- Do not describe the search process in the summary; report what the pages say.`;

/**
 * Turns the transcript into the answer.
 *
 * This is a node rather than a final `invoke` in the caller because the loop and the summary are
 * the same conversation: the pages the agent read are already in the history, and re-sending a
 * hand-assembled digest prompt would mean deciding all over again which of them mattered.
 */
export function createDigestNode(
  model: DigestModel,
  logger: Logger = silentLogger,
): GraphNode<typeof ResearchState> {
  return async (state) => {
    const startedAt = Date.now();

    try {
      const digest = await model.invoke([
        ...withoutDanglingToolCalls(state.messages),
        new HumanMessage(DIGEST_INSTRUCTION),
      ]);

      logger.info("digest written", {
        topic: digest.topic,
        keyPoints: digest.keyPoints.length,
        cited: digest.sources.length,
        durationMs: Date.now() - startedAt,
      });

      return { digest };
    } catch (error) {
      logger.error("digest refused", {
        durationMs: Date.now() - startedAt,
        reason: toMessage(error),
      });

      throw new AgentError(
        AgentFailure.Model,
        `the model produced no digest: ${toMessage(error)}`,
        {
          cause: error,
        },
      );
    }
  };
}

/**
 * Drops a final assistant message that asked for tools which were never answered.
 *
 * That is what a run stopped by the step ceiling looks like, and an OpenAI-compatible endpoint
 * rejects the pair: a `tool_calls` block with no matching tool reply is a malformed conversation,
 * and the digest request would fail on the way in rather than producing an answer.
 */
function withoutDanglingToolCalls(messages: readonly BaseMessage[]): readonly BaseMessage[] {
  const last = messages.at(-1);

  if (last !== undefined && AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0) {
    return messages.slice(0, -1);
  }

  return [...messages];
}
