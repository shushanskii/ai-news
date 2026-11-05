import { ChatOpenAI } from "@langchain/openai";
import type { AgentConfig } from "#config";
import { digestSchema } from "#schemas/digest";
import type { AgentToolDefinition, DigestModel, ResearchModel } from "#types/agent";

/**
 * The chat endpoint, described as OpenAI-compatible because that is what it speaks.
 *
 * Temperature comes from the config rather than being left at the SDK default: a research agent
 * that improvises between two searches is more expensive, not better.
 */
function createChatModel(config: AgentConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.llm.model,
    temperature: config.llm.temperature,
    configuration: {
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    },
  });
}

/** The model with its retrieval tools attached. */
export function createResearchModel(
  config: AgentConfig,
  tools: AgentToolDefinition[],
): ResearchModel {
  return createChatModel(config).bindTools(tools) as unknown as ResearchModel;
}

/**
 * The same endpoint pinned to the digest schema.
 *
 * `functionCalling` is stated rather than left to the default: this endpoint ignores
 * `response_format: json_schema` and answers with bare prose, which the SDK then tries to parse as
 * an object and reports as `expected object, received number`. Asking for a tool call is the one
 * way to get a guaranteed object out of it.
 */
export function createDigestModel(config: AgentConfig): DigestModel {
  return createChatModel(config).withStructuredOutput(digestSchema, {
    method: "functionCalling",
    name: "write_digest",
  }) as unknown as DigestModel;
}
