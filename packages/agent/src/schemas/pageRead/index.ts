import { z } from "zod";

/**
 * The Crawl4AI `/md` answer. Only two fields are read; the rest of the row (html, links, media) is
 * what the service keeps off the wire on purpose.
 *
 * `success` is checked rather than trusted: a content filter answers an empty page with
 * `success: true` and an empty `markdown`, which is why the reader falls through the filters
 * instead of asking for one.
 */
export const crawl4aiMarkdownSchema = z.object({
  url: z.url().optional(),
  success: z.boolean().optional(),
  markdown: z.string(),
  filter: z.string().optional(),
});
