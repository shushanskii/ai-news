import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { createResearchRouter } from "#edges/afterResearch";

type Router = ReturnType<typeof createResearchRouter>;
type RouterState = Parameters<Router>[0];

// The router reads state and nothing else, so the runnable config it is handed by the graph is
// empty here on purpose. The cast is the router's own return type: it may name several branches or
// a Send, and this one always answers with a single node name.
function route(router: Router, messages: readonly BaseMessage[], steps: number): string {
  return router({ messages, steps } as unknown as RouterState, {}) as string;
}

function askingForTools(query: string): AIMessage {
  return new AIMessage({
    content: "",
    // The field is the wire spelling LangChain's message type uses; there is no camelCase alias.
    // biome-ignore lint/style/useNamingConvention: LangChain's AIMessage field name
    tool_calls: [{ name: "search_web", args: { query }, id: "call-1", type: "tool_call" }],
  });
}

describe("createResearchRouter", () => {
  it("sends a tool call to the tools node", () => {
    expect(route(createResearchRouter(8), [askingForTools("q")], 1)).toBe("tools");
  });

  it("writes the digest as soon as the model stops asking for tools", () => {
    expect(route(createResearchRouter(8), [new AIMessage("Here is what I found.")], 2)).toBe(
      "write_digest",
    );
  });

  // A model that keeps finding one more page worth opening is behaving reasonably, and would run
  // until the context window fills up.
  it("stops the loop at the step ceiling even while the model still wants tools", () => {
    expect(route(createResearchRouter(3), [askingForTools("q")], 3)).toBe("write_digest");
    expect(route(createResearchRouter(3), [askingForTools("q")], 2)).toBe("tools");
  });

  it("writes the digest when the last message is not the model's at all", () => {
    expect(route(createResearchRouter(8), [new HumanMessage("start")], 0)).toBe("write_digest");
  });
});
