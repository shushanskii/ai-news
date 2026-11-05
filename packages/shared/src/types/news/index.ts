/**
 * A retrieval tool the agent is allowed to reach for. The names are the capabilities the model
 * sees; the backing service is an implementation detail of `@app/agent`.
 */
export enum AgentTool {
  /** Query SearXNG and get ranked hits back. */
  Search = "search_web",
  /** Fetch one URL through Crawl4AI and get its readable text. */
  Read = "read_page",
}

/**
 * One web page the digest rests on. A source is listed whether or not the agent read it: a hit the
 * model only saw in the result list still belongs in the bibliography, and `read` is what tells
 * the two apart. Dropping unread sources would silently present a snippet as a read article.
 */
export interface ResearchSource {
  readonly url: string;
  readonly title: string;
  /** Short excerpt, from the search result or from the fetched page. */
  readonly snippet?: string;
  /** `true` when the page was actually fetched and read, `false` when only the hit was seen. */
  readonly read: boolean;
}

/** What it cost to produce the digest — the part of the answer that is not the model's opinion. */
export interface ResearchMeta {
  readonly model: string;
  /** LLM round trips the graph made, tool calls included. */
  readonly steps: number;
  readonly toolCalls: number;
  readonly durationMs: number;
  /** ISO timestamp of the moment the digest was assembled. */
  readonly generatedAt: string;
}

/** The whole answer: a summary of the topic, the claims behind it, and where they came from. */
export interface ResearchResult {
  /** What the agent understood the request to be — usually the prompt, sometimes narrowed. */
  readonly topic: string;
  readonly summary: string;
  // Mutable arrays on readonly fields: this object lands in an Immer-backed slice, and Immer's
  // draft type rejects a readonly array. The fields stay `readonly`, so nothing reassigns them.
  readonly keyPoints: string[];
  readonly sources: ResearchSource[];
  /** The queries the agent actually ran, in order, so a human can re-run the search by hand. */
  readonly queries: string[];
  readonly meta: ResearchMeta;
}
