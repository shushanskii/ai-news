import { z } from "zod";
import type { DigestCitation, DigestDraft } from "#types/agent";

// The shape the model is held to at the end of a run. The descriptions are not comments: they are
// the field-by-field instructions the endpoint receives, so they are written for the model.
//
// `satisfies` pins these to the interfaces in `types/` without erasing the concrete schema type —
// a `ZodType<T>` annotation typechecks but leaves LangGraph unable to infer what the state channel
// holds, and the digest then fails to be a legal update for it. It goes on the closing line: the
// parser reads a `satisfies` at the start of a line as a new statement.

const digestCitationSchema = z.object({
  url: z
    .url()
    .describe(
      "Absolute URL of the page, copied exactly from the search result or the page you opened",
    ),
  title: z.string().min(1).describe("Headline as the page itself shows it"),
  snippet: z
    .string()
    .min(1)
    .optional()
    .describe("A short quote or close paraphrase from that page, if one is worth keeping"),
}) satisfies z.ZodType<DigestCitation>;

export const digestSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe(
      "What the digest is about, in a few words — the request narrowed to what was actually found",
    ),
  summary: z
    .string()
    .min(1)
    .describe(
      "Three to six sentences of plain prose answering the request. State only what the pages say; no preamble about the search itself.",
    ),
  keyPoints: z
    .array(z.string().min(1))
    .describe(
      "Three to six standalone findings, one sentence each, each traceable to a listed source",
    ),
  sources: z
    .array(digestCitationSchema)
    .describe(
      "Every page the digest rests on, most load-bearing first. Never invent a URL and never list a page that was not in the results.",
    ),
}) satisfies z.ZodType<DigestDraft>;
