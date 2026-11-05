import type { ResearchSource } from "@app/shared";
import type { DigestDraft } from "#types/agent";

/**
 * The bibliography the caller gets: what the digest cites first, then everything else the agent
 * came across, up to the ceiling the request set.
 *
 * A URL the model cites but no tool ever returned is dropped rather than listed. The prompt forbids
 * inventing one, and a run that disobeyed that is precisely the run where the citation cannot be
 * trusted — a source list is the one part of this answer a reader checks by hand.
 */
export function bibliography(
  seen: readonly ResearchSource[],
  digest: DigestDraft,
  maxSources: number,
): readonly ResearchSource[] {
  const byUrl = new Map(seen.map((source) => [source.url, source]));
  const ordered: ResearchSource[] = [];
  const taken = new Set<string>();

  for (const citation of digest.sources) {
    const source = byUrl.get(citation.url);

    if (source === undefined || taken.has(citation.url)) {
      continue;
    }

    ordered.push(source);
    taken.add(citation.url);
  }

  // Read pages before unread ones: an excerpt the agent never opened is context, not evidence.
  const rest = [...seen]
    .filter((source) => !taken.has(source.url))
    .sort((left, right) => Number(right.read) - Number(left.read));

  for (const source of rest) {
    if (ordered.length >= maxSources) {
      break;
    }

    ordered.push(source);
    taken.add(source.url);
  }

  return ordered.slice(0, maxSources);
}
