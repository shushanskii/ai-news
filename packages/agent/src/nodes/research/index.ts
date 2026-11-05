import type { GraphNode } from "@langchain/langgraph";
import { AgentError, toMessage } from "#errors/agent";
import { type Logger, silentLogger } from "#logging";
import type { ResearchState } from "#state";
import { AgentFailure, type ResearchModel } from "#types/agent";

/**
 * One round trip to the model.
 *
 * The instructions are not sent from here: they arrive as the first message of the run, so a node
 * stays a plain "ask what the state already says" step and a request that brings its own system
 * prompt needs no special case.
 */
export function createResearchNode(
  model: ResearchModel,
  logger: Logger = silentLogger,
): GraphNode<typeof ResearchState> {
  return async (state) => {
    const startedAt = Date.now();

    logger.debug("model asked", { step: state.steps + 1, messages: state.messages.length });

    try {
      const response = await model.invoke(state.messages);
      const requested = response.tool_calls?.length ?? 0;

      // Which of the two it did is the interesting part: a run that stops early and a run that
      // keeps searching look identical until you see what each round asked for.
      logger.info(requested > 0 ? "model asked for tools" : "model answered", {
        step: state.steps + 1,
        requested,
        durationMs: Date.now() - startedAt,
      });

      return { messages: [response], steps: 1 };
    } catch (error) {
      logger.error("model did not answer", {
        step: state.steps + 1,
        durationMs: Date.now() - startedAt,
        reason: toMessage(error),
      });

      throw new AgentError(AgentFailure.Model, `the model did not answer: ${toMessage(error)}`, {
        cause: error,
      });
    }
  };
}
