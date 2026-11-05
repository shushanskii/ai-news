import { randomUUID } from "node:crypto";
import {
  AgentTool,
  type ResearchRequest,
  type ResearchResult,
  researchRequestSchema,
} from "@app/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { bibliography } from "#bibliography";
import { type AgentConfig, loadConfig } from "#config";
import { createResearchRouter } from "#edges/afterResearch";
import { AgentError } from "#errors/agent";
import { createLogger, type Logger } from "#logging";
import { createDigestModel, createResearchModel } from "#model";
import { createDigestNode } from "#nodes/digest";
import { createResearchNode } from "#nodes/research";
import { createToolsNode } from "#nodes/tools";
import { ResearchState } from "#state";
import { createReadPageTool } from "#tools/readPage";
import { createSearchWebTool } from "#tools/searchWeb";
import { AgentFailure, type AgentToolDefinition, type AgentToolLike } from "#types/agent";

/**
 * A request with every optional part resolved, which is what the graph is built from.
 */
interface ResolvedRequest {
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly tools: readonly AgentTool[];
  readonly maxSources: number;
  readonly language?: string;
}

/** How a run may be adjusted by the caller. Both parts have working defaults. */
export interface RunOptions {
  /** Defaults to `loadConfig()`, which reads the environment. */
  readonly config?: AgentConfig;
  /** Defaults to a logger writing to stderr, so a script that calls `runResearch` is not silent. */
  readonly logger?: Logger;
}

/**
 * The research loop: ask, run whatever the model asked for, ask again, then write.
 *
 * `research` and `tools` form the cycle; `write_digest` sits outside it on purpose. Summarising
 * inside the loop would let the model answer mid-search, which is exactly the failure this whole
 * shape exists to prevent. A node may not be named after a channel, which is why the node is
 * `write_digest` while the channel holding its answer stays `digest`.
 */
function createResearchGraph(config: AgentConfig, request: ResolvedRequest, logger: Logger) {
  const tools = buildTools(config, request.tools);
  const graph = new StateGraph(ResearchState)
    .addNode("research", createResearchNode(createResearchModel(config, tools), logger))
    .addNode("tools", createToolsNode(tools as unknown as readonly AgentToolLike[], logger))
    .addNode("write_digest", createDigestNode(createDigestModel(config), logger))
    .addEdge(START, "research")
    .addConditionalEdges("research", createResearchRouter(config.maxSteps), [
      "tools",
      "write_digest",
    ])
    .addEdge("tools", "research")
    .addEdge("write_digest", END);

  return graph.compile();
}

/**
 * Look something up and say what is being reported about it.
 *
 * The whole of the agent's public surface: a request in, a digest out. Everything the caller asked
 * for — the prompt, the instructions, the tools it allowed — reaches the graph through this call,
 * and nothing about LangGraph crosses it.
 *
 * The request is validated here rather than trusted: the defaults are the schema's, so a caller
 * that skips the HTTP layer still gets the same run the endpoint would have produced.
 */
export async function runResearch(
  request: ResearchRequest,
  options: RunOptions = {},
): Promise<ResearchResult> {
  const config = options.config ?? loadConfig();
  const input = researchRequestSchema.parse(request);

  const resolved: ResolvedRequest = {
    prompt: input.prompt,
    systemPrompt: input.systemPrompt ?? config.defaultSystemPrompt,
    tools: input.tools,
    maxSources: input.maxSources,
    ...(input.language === undefined ? {} : { language: input.language }),
  };

  // Bound once, here, so the twenty lines one run produces belong together. A caller that already
  // has a request id gets the run lines under it as well: this child sits under theirs.
  const logger = (options.logger ?? createLogger()).child({ runId: randomUUID().slice(0, 8) });
  const startedAt = Date.now();

  logger.info("run started", {
    prompt: resolved.prompt,
    tools: resolved.tools,
    maxSources: resolved.maxSources,
    model: config.llm.model,
  });

  try {
    const result = await execute(config, resolved, logger, startedAt);

    logger.info("run finished", {
      steps: result.meta.steps,
      toolCalls: result.meta.toolCalls,
      sources: result.sources.length,
      queries: result.queries.length,
      durationMs: result.meta.durationMs,
    });

    return result;
  } catch (error) {
    logger.error("run failed", {
      failure: error instanceof AgentError ? error.failure : "unexpected",
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

async function execute(
  config: AgentConfig,
  resolved: ResolvedRequest,
  logger: Logger,
  startedAt: number,
): Promise<ResearchResult> {
  const graph = createResearchGraph(config, resolved, logger);

  const state = await graph
    .invoke(
      {
        messages: [new SystemMessage(instructionsFor(resolved)), new HumanMessage(resolved.prompt)],
      },
      // One round is two supersteps (ask, then run the tools), plus the digest and the start.
      { recursionLimit: config.maxSteps * 2 + 3 },
    )
    .catch((error: unknown) => {
      if (error instanceof AgentError) {
        throw error;
      }

      throw new AgentError(AgentFailure.Model, `the agent run failed: ${String(error)}`, {
        cause: error,
      });
    });

  if (state.digest === null) {
    throw new AgentError(
      AgentFailure.Empty,
      "the agent finished without writing a digest — raise AGENT_MAX_STEPS or narrow the request",
    );
  }

  const sources = [...bibliography(state.sources, state.digest, resolved.maxSources)];
  const invented = inventedCitations(state.sources, state.digest.sources);

  // The prompt forbids citing a page no tool returned, and a run that did it anyway is the run
  // where the citation cannot be trusted. Silent here would be the worst place for it.
  if (invented.length > 0) {
    logger.warn("citations dropped", { invented: invented.map((citation) => citation.url) });
  }

  return {
    topic: state.digest.topic,
    summary: state.digest.summary,
    keyPoints: [...state.digest.keyPoints],
    sources,
    queries: [...state.queries],
    meta: {
      model: config.llm.model,
      steps: state.steps,
      toolCalls: state.toolCalls,
      durationMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildTools(config: AgentConfig, selected: readonly AgentTool[]): AgentToolDefinition[] {
  const tools: AgentToolDefinition[] = [];

  if (selected.includes(AgentTool.Search)) {
    tools.push(createSearchWebTool(config));
  }

  if (selected.includes(AgentTool.Read)) {
    tools.push(createReadPageTool(config));
  }

  if (tools.length === 0) {
    throw new AgentError(
      AgentFailure.Config,
      `no retrieval tool was selected; this agent has ${AgentTool.Search} and ${AgentTool.Read}`,
    );
  }

  return tools;
}

/**
 * The system prompt, with the two parts of the request that are not prose folded into it.
 *
 * The language is stated last and most bluntly: a model that has just read a page of instructions
 * in one language will otherwise answer in that language, whatever the question was written in.
 */
function instructionsFor(request: ResolvedRequest): string {
  if (request.language === undefined) {
    return request.systemPrompt;
  }

  return `${request.systemPrompt}\n\nWrite the digest in ${request.language}, whatever language the pages you read are in.`;
}

/** Citations the model named that no tool ever handed back. */
function inventedCitations(
  seen: readonly { readonly url: string }[],
  cited: readonly { readonly url: string }[],
): readonly { readonly url: string }[] {
  const known = new Set(seen.map((source) => source.url));

  return cited.filter((citation) => !known.has(citation.url));
}
