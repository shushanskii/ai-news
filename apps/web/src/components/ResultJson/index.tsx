import type { ResearchResult } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";

const Details = styled.details`
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
`;

const Summary = styled.summary`
  color: #4b5563;
  cursor: pointer;
  font-size: 13px;
`;

const Body = styled.pre`
  background-color: #f9fafb;
  border-radius: 6px;
  font-size: 12px;
  margin: 10px 0 0;
  overflow-x: auto;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
`;

interface ResultJsonProps {
  readonly result: ResearchResult;
}

/**
 * The answer as the service sent it.
 *
 * Folded away because almost nobody reads it, and printed in full because the person who does want
 * it wants the exact bytes: this is the body a bug report gets pasted with, and a re-typed summary
 * of it is worth nothing.
 */
export const ResultJson = memo(function ResultJson({ result }: ResultJsonProps) {
  return (
    <Details>
      <Summary>JSON ответа</Summary>
      <Body>{JSON.stringify(result, null, 2)}</Body>
    </Details>
  );
});
