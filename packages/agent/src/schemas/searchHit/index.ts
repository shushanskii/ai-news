import { z } from "zod";
import type { SearchHit } from "#types/agent";

// SearXNG is another team's process answering JSON: untrusted until a schema says otherwise. The
// row schema is deliberately generous about the fields it does not use — an engine adds and renames
// keys between releases, and a strict object would turn that into a broken agent.

const searchHitSchema: z.ZodType<SearchHit> = z.object({
  url: z.url(),
  title: z.string().min(1),
  // Engines answer `null` rather than omitting an excerpt for a page they cannot describe.
  snippet: z.string().default(""),
  publishedAt: z.string().optional(),
});

// The url is validated per row by `searchHitSchema`, not here: an engine that returns one row with
// a url it cannot spell must cost that row, not the whole result list.
const searxngResultSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1).catch("Untitled result"),
  content: z.string().nullish(),
  // biome-ignore lint/style/useNamingConvention: the field SearXNG answers with
  published_date: z.string().nullish(),
});

export const searxngResponseSchema = z
  .object({
    // A query the engine cannot route answers with `{"error": "..."}` and no results key.
    error: z.string().optional(),
    results: z.array(searxngResultSchema).optional(),
  })
  .transform((response) => {
    // One malformed row must not cost the whole result list: a news aggregator returns a mix of
    // news articles, PDFs and protocol URLs, and only some of them spell their URL validly.
    const hits = (response.results ?? [])
      .map((result) =>
        searchHitSchema.safeParse({
          url: result.url,
          title: result.title,
          snippet: result.content ?? "",
          ...(result.published_date == null ? {} : { publishedAt: result.published_date }),
        }),
      )
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));

    return { error: response.error, hits };
  });
