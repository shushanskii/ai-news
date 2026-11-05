import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AgentError } from "#errors/agent";
import { AgentFailure } from "#types/agent";

export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** Low on purpose: this endpoint reports facts about pages, it is not being creative. */
  readonly temperature: number;
}

export interface SearxngConfig {
  readonly baseUrl: string;
  /** SearXNG category, `news` narrows to news engines; `general` is the whole index. */
  readonly category: string;
  readonly timeoutMs: number;
  /** Hits per query, when the model does not ask for a different number. */
  readonly maxResults: number;
}

export interface Crawl4aiConfig {
  readonly baseUrl: string;
  /** File holding the bearer token, read on every call so a rotation needs no restart. */
  readonly tokenFile: string;
  readonly timeoutMs: number;
  /** Characters of page text handed to the model per read. */
  readonly maxChars: number;
}

export interface AgentConfig {
  readonly llm: LlmConfig;
  readonly searxng: SearxngConfig;
  readonly crawl4ai: Crawl4aiConfig;
  /** Ceiling on LLM round trips, so a model that keeps calling tools cannot run forever. */
  readonly maxSteps: number;
  /** Used when the request carries no system prompt of its own. */
  readonly defaultSystemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are a research assistant. Your job is to find out what is currently being reported about a topic and to say so plainly.

Work in this order:
1. Search for the topic, then search again with different words if the first query returned nothing useful.
2. Open the pages that look most load-bearing. A search excerpt is not a source: it is a headline, and headlines get rewritten.
3. Write the digest only from what the opened pages actually say.

Rules:
- Every claim must trace to a URL you were given. Never invent a URL, and never cite a page you did not open as if you had.
- Prefer primary and dated sources over aggregators that paraphrase them.
- If the searches return nothing relevant, say that in the summary instead of filling in from memory. An honest "nothing found" is a result.
- Write in the language of the request unless the request names another language.
- Stop as soon as you have enough to answer. Searching twice more "to be sure" costs a minute of browser time and changes nothing.`;

/**
 * Configuration for one agent process, from the environment.
 *
 * The defaults are the lab's own services, so `pnpm dev` works with no `.env` at all; the variables
 * exist for the deployment where those services live elsewhere.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    llm: {
      baseUrl: text(env, "LLM_BASE_URL", "https://halogen.rezolver-zero.com/v1"),
      // An OpenAI-compatible endpoint with no auth still wants a non-empty key from the SDK.
      apiKey: text(env, "LLM_API_KEY", "none"),
      model: text(env, "LLM_MODEL", "qwen3.8-flash-next"),
      temperature: decimal(env, "LLM_TEMPERATURE", 0.2),
    },
    searxng: {
      baseUrl: text(env, "SEARXNG_URL", "https://search.rezolver-zero.com"),
      category: text(env, "SEARXNG_CATEGORY", "news"),
      timeoutMs: whole(env, "SEARXNG_TIMEOUT_MS", 30_000),
      maxResults: whole(env, "SEARXNG_MAX_RESULTS", 8),
    },
    crawl4ai: {
      baseUrl: text(env, "CRAWL4AI_URL", "https://fetch.rezolver-zero.com"),
      tokenFile: text(env, "CRAWL4AI_TOKEN_FILE", "~/.pi/agent/mcp/c4a.token"),
      // A cold Chromium plus a slow site: this is the one timeout that has to be generous.
      timeoutMs: whole(env, "CRAWL4AI_TIMEOUT_MS", 120_000),
      maxChars: whole(env, "CRAWL4AI_MAX_CHARS", 12_000),
    },
    maxSteps: whole(env, "AGENT_MAX_STEPS", 8),
    defaultSystemPrompt: text(env, "AGENT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
  };
}

/**
 * The fetcher's bearer token, read fresh on every call.
 *
 * The file is the source of truth rather than an environment variable because that is where the
 * lab already keeps it, and because a token that never enters the process environment cannot leak
 * into a log line or a crash dump.
 */
export function readBearerToken(tokenFile: string): string {
  const path = expandHome(tokenFile);

  let token: string;

  try {
    token = readFileSync(path, "utf8").trim();
  } catch (error) {
    throw new AgentError(
      AgentFailure.Config,
      `the fetcher token is unreadable: ${path} (CRAWL4AI_TOKEN_FILE)`,
      { cause: error },
    );
  }

  if (token === "") {
    throw new AgentError(AgentFailure.Config, `the fetcher token file is empty: ${path}`);
  }

  return token;
}

function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }

  return path.startsWith("~/") ? `${homedir()}/${path.slice(2)}` : path;
}

function text(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name];

  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

// A typo in a deployment is reported, not swallowed: a silently defaulted timeout looks exactly
// like a service that has become slow.
function whole(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];

  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value.trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AgentError(
      AgentFailure.Config,
      `${name} wants a whole number above zero, got "${value}"`,
    );
  }

  return parsed;
}

function decimal(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];

  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value.trim());

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AgentError(
      AgentFailure.Config,
      `${name} wants a number of 0 or more, got "${value}"`,
    );
  }

  return parsed;
}
