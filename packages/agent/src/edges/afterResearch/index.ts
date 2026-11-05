import { AIMessage } from "@langchain/core/messages";
import type { ConditionalEdgeRouter } from "@langchain/langgraph";
import type { ResearchState } from "#state";

/**
 * Where the loop goes after the model answers.
 *
 * Two ways out of the loop, and the ceiling is the one that keeps a run finite: a model that keeps
 * finding one more page worth opening is behaving reasonably, and would run until the context
 * window fills up.
 */
export function createResearchRouter(
  maxSteps: number,
): ConditionalEdgeRouter<typeof ResearchState> {
  return (state) => {
    const last = state.messages.at(-1);
    const wantsTools =
      last !== undefined && AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0;

    if (!wantsTools) {
      return "write_digest";
    }

    return state.steps >= maxSteps ? "write_digest" : "tools";
  };
}
