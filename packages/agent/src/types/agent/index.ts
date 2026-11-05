import type { AIMessage, BaseMessageLike } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";

/**
 * Where a run stopped short. The service maps these onto an HTTP status, so the taxonomy is about
 * who to blame: a missing token file is an operator's problem, a search engine that answered 500
 * is upstream's, and a model that refused to summarise is the model's.
 */
export enum AgentFailure {
  /** The process is not wired up: a missing URL, an unreadable token file. */
  Config = "config",
  /** The search engine refused or answered nonsense. */
  Search = "search",
  /** Crawl4AI refused, timed out, or returned an empty page. */
  Fetch = "fetch",
  /** The chat endpoint failed, or answered in a shape the digest schema rejects. */
  Model = "model",
  /** Every step succeeded and there is still nothing to summarise. */
  Empty = "empty",
}

/** One result row from the search engine, before anyone has opened the page. */
export interface SearchHit {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
  /** Publication date as the engine spells it, absent when the engine does not guess one. */
  readonly publishedAt?: string;
}

/** What a search call produced. `kind` is what lets the tool node format it without a lookup. */
export interface SearchOutcome {
  readonly kind: "search";
  readonly query: string;
  readonly hits: readonly SearchHit[];
}

/** What a read call produced. `markdown` is already clipped to the configured budget. */
export interface ReadOutcome {
  readonly kind: "page";
  readonly url: string;
  readonly title: string;
  readonly markdown: string;
  /** `true` when the page was longer than the budget and the tail never reached the model. */
  readonly truncated: boolean;
}

/** The union a tool returns; the tool node turns one of these into a `ToolMessage`. */
export type ToolOutcome = SearchOutcome | ReadOutcome;

/**
 * What the model is asked to produce at the end of a run: the answer itself, with the URLs it
 * leans on. `#schemas/digest` validates it at runtime; this is the shape it validates against.
 */
export interface DigestDraft {
  readonly topic: string;
  readonly summary: string;
  // Mutable arrays: this is the shape the schema describes, and a LangGraph channel built from that
  // schema rejects a readonly one as an update. The digest is copied out of here before it is sent.
  readonly keyPoints: string[];
  readonly sources: DigestCitation[];
}

/** A source as the model names it — a URL and a headline, with no claim about having read it. */
export interface DigestCitation {
  readonly url: string;
  readonly title: string;
  readonly snippet?: string;
}

/**
 * The slice of a LangChain tool this package relies on: a name the model can call, and an invoke
 * that runs it. Spelled as an interface so the tool node can be handed a stub in a test.
 */
export interface AgentToolLike {
  readonly name: string;
  invoke(input: Record<string, unknown>): Promise<ToolOutcome>;
}

/** A tool definition, as `bindTools` wants it. */
export type AgentToolDefinition = DynamicStructuredTool;

/** The chat model the research loop talks to. */
export interface ResearchModel {
  invoke(messages: readonly BaseMessageLike[]): Promise<AIMessage>;
}

/** The same endpoint pinned to the digest schema by `withStructuredOutput`. */
export interface DigestModel {
  invoke(messages: readonly BaseMessageLike[]): Promise<DigestDraft>;
}
