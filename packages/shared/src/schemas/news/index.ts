import { z } from "zod";
import {
  AgentTool,
  type ResearchMeta,
  type ResearchResult,
  type ResearchSource,
} from "#types/news";

// Wire formats live here, not in `types/`: a schema is runtime behaviour, and `types/` holds only
// types. The request DTO is inferred from the schema, so validation and types cannot drift.

// The whole input of the agent, in the three parts the interface names: what to look for, how to
// behave while looking, and which retrieval tools it may reach for. Everything else is a knob with
// a default the service owns.
export const researchRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  // Absent means the agent's own default persona; an empty string is a client bug, not "no
  // instructions", so it is rejected rather than silently falling back.
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
  // An empty array would ask for a research agent with no way to research, so "no tools" is not a
  // request this endpoint accepts.
  tools: z
    .array(z.enum(AgentTool))
    .min(1)
    .refine((tools) => new Set(tools).size === tools.length, {
      message: "the same tool cannot be listed twice",
    })
    .default(Object.values(AgentTool)),
  // A ceiling on the bibliography, not on the reading: the agent may look at more pages than it
  // ends up citing.
  maxSources: z.number().int().min(1).max(20).default(8),
  // BCP 47-ish free text ("ru", "en-US"): the model is told which language to write in, so there is
  // nothing to validate against a closed list. Absent means "answer in the language of the prompt".
  language: z.string().trim().min(2).max(32).optional(),
});

// Responses are checked against the domain model rather than inferring a second copy of it. The
// `satisfies` makes a schema that drifts from the interface a compile error and — unlike a
// `ZodType<T>` annotation — keeps the concrete schema type, which is what lets `@app/agent` drop
// these schemas straight into a LangGraph state channel. It is written on the closing line: the
// parser treats `satisfies` at the start of a line as a new statement.
export const researchSourceSchema = z.object({
  url: z.url(),
  title: z.string().min(1),
  snippet: z.string().min(1).optional(),
  read: z.boolean(),
}) satisfies z.ZodType<ResearchSource>;

export const researchMetaSchema = z.object({
  model: z.string().min(1),
  steps: z.number().int().min(0),
  toolCalls: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  generatedAt: z.iso.datetime(),
}) satisfies z.ZodType<ResearchMeta>;

export const researchResultSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)),
  sources: z.array(researchSourceSchema),
  queries: z.array(z.string().min(1)),
  meta: researchMetaSchema,
}) satisfies z.ZodType<ResearchResult>;

// The failure body every non-2xx from the service carries. The client parses it so a 400 says
// which field was wrong instead of only that something was.
export const apiErrorSchema = z.object({
  error: z.string().min(1),
  formErrors: z.array(z.string()).optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

// `z.input`, not `z.infer`: the caller builds a request where `tools` and `maxSources` may stay
// out, while the parsed value the route works with always has them.
export type ResearchRequest = z.input<typeof researchRequestSchema>;
