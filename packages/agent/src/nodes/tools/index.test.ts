import type { ResearchSource } from "@app/shared";
import type { ToolMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { describe, expect, it, vi } from "vitest";
import { createLogger, type Logger } from "#logging";
import { createToolsNode } from "#nodes/tools";
import type { AgentToolLike, ReadOutcome, SearchOutcome } from "#types/agent";

type ToolsNode = ReturnType<typeof createToolsNode>;
type NodeState = Parameters<ToolsNode>[0];

// What the node returns is typed as a union with `Command` because any LangGraph node may return
// one; this node always returns a plain state update, and the test says so once instead of at
// every assertion.
interface NodeUpdate {
  readonly messages: readonly ToolMessage[];
  readonly sources: readonly ResearchSource[];
  readonly queries: readonly string[];
  readonly toolCalls: number;
}

function toolCall(name: string, args: Record<string, unknown>, id = "call-1") {
  return { name, args, id, type: "tool_call" as const };
}

function stateAskingFor(...calls: ReturnType<typeof toolCall>[]): NodeState {
  return {
    messages: [
      new AIMessage({
        content: "",
        // biome-ignore lint/style/useNamingConvention: LangChain's AIMessage field name
        tool_calls: calls,
      }),
    ],
  } as unknown as NodeState;
}

async function run(node: ToolsNode, state: NodeState): Promise<NodeUpdate> {
  return (await node(state, {} as never)) as unknown as NodeUpdate;
}

const searchOutcome: SearchOutcome = {
  kind: "search",
  query: "grid batteries",
  hits: [
    { url: "https://example.com/a", title: "Plant opens", snippet: "A line." },
    { url: "https://example.com/b", title: "No excerpt", snippet: "" },
  ],
};

const readOutcome: ReadOutcome = {
  kind: "page",
  url: "https://example.com/a",
  title: "Plant opens",
  markdown: "# Plant opens\n\nThe plant opened in March.\n\n## Related\n\nMore links.",
  truncated: false,
};

describe("createToolsNode", () => {
  it("answers a search call with the hits the model can cite", async () => {
    const tool: AgentToolLike = { name: "search_web", invoke: async () => searchOutcome };
    const update = await run(createToolsNode([tool]), stateAskingFor(toolCall("search_web", {})));

    expect(update.messages).toHaveLength(1);
    expect(update.messages[0]?.content).toContain("https://example.com/a");
    expect(update.messages[0]?.content).toContain("Plant opens");
    expect(update.messages[0]?.tool_call_id).toBe("call-1");
  });

  it("records the query and every hit as an unread source", async () => {
    const tool: AgentToolLike = { name: "search_web", invoke: async () => searchOutcome };
    const update = await run(createToolsNode([tool]), stateAskingFor(toolCall("search_web", {})));

    expect(update.queries).toEqual(["grid batteries"]);
    expect(update.sources.map((source) => source.read)).toEqual([false, false]);
  });

  // An empty excerpt is not a snippet, and the wire schema refuses an empty string for it.
  it("leaves the snippet off a hit that had no excerpt", async () => {
    const tool: AgentToolLike = { name: "search_web", invoke: async () => searchOutcome };
    const update = await run(createToolsNode([tool]), stateAskingFor(toolCall("search_web", {})));

    expect(update.sources[0]).toHaveProperty("snippet", "A line.");
    expect(update.sources[1]).not.toHaveProperty("snippet");
  });

  it("marks a page that came back through the fetcher as read", async () => {
    const tool: AgentToolLike = { name: "read_page", invoke: async () => readOutcome };
    const update = await run(createToolsNode([tool]), stateAskingFor(toolCall("read_page", {})));

    expect(update.sources).toEqual([
      {
        url: "https://example.com/a",
        title: "Plant opens",
        snippet: "The plant opened in March.",
        read: true,
      },
    ]);
    expect(update.queries).toEqual([]);
  });

  it("counts every call the model made in one answer", async () => {
    const tool: AgentToolLike = { name: "search_web", invoke: async () => searchOutcome };
    const update = await run(
      createToolsNode([tool]),
      stateAskingFor(toolCall("search_web", {}, "call-1"), toolCall("search_web", {}, "call-2")),
    );

    expect(update.toolCalls).toBe(2);
    expect(update.messages.map((message) => message.tool_call_id)).toEqual(["call-1", "call-2"]);
  });

  // One bad call is not a failed run: the model is told what does not exist and carries on.
  it("tells the model about a tool the request did not allow", async () => {
    const update = await run(createToolsNode([]), stateAskingFor(toolCall("browse_instagram", {})));

    expect(update.messages[0]?.status).toBe("error");
    expect(update.messages[0]?.content).toContain("browse_instagram");
    expect(update.sources).toEqual([]);
  });

  it("turns a failing tool into an answer rather than a crashed run", async () => {
    const failing: AgentToolLike = {
      name: "read_page",
      invoke: async () => {
        throw new Error("the page came back with no readable text");
      },
    };
    const working: AgentToolLike = { name: "search_web", invoke: async () => searchOutcome };

    const update = await run(
      createToolsNode([failing, working]),
      stateAskingFor(toolCall("read_page", {}, "call-1"), toolCall("search_web", {}, "call-2")),
    );

    expect(update.messages[0]?.status).toBe("error");
    expect(update.messages[0]?.content).toContain("no readable text");
    expect(update.messages[1]?.status).toBe("success");
    expect(update.sources).toHaveLength(2);
  });

  it("does nothing when the model asked for nothing", async () => {
    const invoke = vi.fn(async () => searchOutcome);
    const node = createToolsNode([{ name: "search_web", invoke }]);

    const update = await run(node, {
      messages: [new AIMessage("done")],
    } as unknown as NodeState);

    expect(update.messages).toEqual([]);
    expect(update.toolCalls).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  // The run's own record is the bibliography; this is the record for the person reading the log at
  // 3 a.m., and the two are not the same thing: one answers "what did the agent know", the other
  // "which of the twenty calls was slow".
  it("says what each call was and what it cost", async () => {
    const lines: string[] = [];
    const logger: Logger = createLogger({ level: "debug", write: (line) => lines.push(line) });
    const slow: AgentToolLike = {
      name: "read_page",
      invoke: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));

        return readOutcome;
      },
    };

    await run(
      createToolsNode([slow], logger),
      stateAskingFor(toolCall("read_page", { url: "https://example.com/a" })),
    );

    const line = lines.find((entry) => entry.includes("tool call")) ?? "";

    expect(line).toContain("tool=read_page");
    expect(line).toContain(`chars=${readOutcome.markdown.length}`);
    expect(line).toMatch(/durationMs=[1-9]\d*/);
  });

  it("warns about a tool the request did not allow", async () => {
    const lines: string[] = [];
    const logger: Logger = createLogger({ level: "debug", write: (line) => lines.push(line) });

    await run(createToolsNode([], logger), stateAskingFor(toolCall("browse_instagram", {})));

    expect(lines.some((line) => line.includes("WARN") && line.includes("tool unknown"))).toBe(true);
  });
});
