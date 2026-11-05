import type { ResearchMeta } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";

const Card = styled.section`
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 18px 20px;
`;

const Topic = styled.h2`
  font-size: 17px;
  margin: 0 0 10px;
`;

const Summary = styled.p`
  margin: 0;
  white-space: pre-wrap;
`;

const Points = styled.ul`
  margin: 14px 0 0;
  padding-left: 20px;
`;

const Point = styled.li`
  margin-bottom: 6px;

  /* A finding the model could not finish is worse than no finding: it reads like a claim. */
  &:empty {
    display: none;
  }
`;

const Meta = styled.dl`
  color: #6b7280;
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px 18px;
  margin: 16px 0 0;
`;

const MetaItem = styled.div`
  display: flex;
  gap: 6px;
`;

const MetaValue = styled.strong`
  color: #16181d;
  font-weight: 600;
`;

interface SummaryCardProps {
  readonly topic: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly meta: ResearchMeta;
}

/**
 * The answer, and the receipts for how it was produced.
 *
 * The counters are on screen because a summary without them is unverifiable: two tool calls and
 * eleven are two different kinds of confidence, and the reader should not have to guess which one
 * they are reading.
 */
export const SummaryCard = memo(function SummaryCard({
  topic,
  summary,
  keyPoints,
  meta,
}: SummaryCardProps) {
  const seconds = Math.round(meta.durationMs / 1000);

  return (
    <Card aria-label="Сводка" role="region">
      <Topic>{topic}</Topic>
      <Summary>{summary}</Summary>

      {keyPoints.length === 0 ? null : (
        <Points>
          {keyPoints.map((point) => (
            <Point key={point}>{point}</Point>
          ))}
        </Points>
      )}

      <Meta>
        <MetaItem title="Модель, которая писала сводку">
          <span>модель</span>
          <MetaValue>{meta.model}</MetaValue>
        </MetaItem>
        <MetaItem title="Шагов модели">
          <span>шагов</span>
          <MetaValue>{meta.steps}</MetaValue>
        </MetaItem>
        <MetaItem title="Вызовов инструментов">
          <span>запросов</span>
          <MetaValue>{meta.toolCalls}</MetaValue>
        </MetaItem>
        <MetaItem title="Сколько длился поиск">
          <span>время</span>
          <MetaValue>{seconds} с</MetaValue>
        </MetaItem>
      </Meta>
    </Card>
  );
});
