import type { ResearchSource } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";
import { SourceItem } from "#components/SourceItem";

const Section = styled.section`
  display: grid;
  gap: 8px;
`;

const Heading = styled.h3`
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  text-transform: uppercase;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Empty = styled.p`
  color: #6b7280;
  font-size: 13px;
  margin: 0;
`;

interface SourceListProps {
  readonly sources: readonly ResearchSource[];
}

/**
 * Everything the run came across, cited first.
 *
 * The order is the agent's, not alphabetical: the digest said which pages it leaned on, and that
 * is the part of the answer worth checking first.
 */
export const SourceList = memo(function SourceList({ sources }: SourceListProps) {
  const opened = sources.filter((source) => source.read).length;

  return (
    <Section aria-label="Источники" role="region">
      <Heading>
        {`Источники: ${sources.length}`}
        {sources.length === 0 ? "" : `, открыто ${opened}`}
      </Heading>

      {sources.length === 0 ? (
        <Empty>
          Агент не нашёл ни одной страницы — сводка написана по его собственным знаниям.
        </Empty>
      ) : (
        <List>
          {sources.map((source) => (
            <SourceItem key={source.url} source={source} />
          ))}
        </List>
      )}
    </Section>
  );
});
