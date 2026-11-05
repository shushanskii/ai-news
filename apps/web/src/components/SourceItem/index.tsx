import type { ResearchSource } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";

const Item = styled.li`
  border-top: 1px solid #eef0f3;
  padding: 10px 0;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
`;

const Head = styled.div`
  align-items: baseline;
  display: flex;
  gap: 8px;
`;

const Link = styled.a`
  color: #1d4ed8;
  overflow-wrap: anywhere;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

// The distinction this badge exists to make: the agent opened this page, or it only saw a headline
// about it. A source list that hides that teaches the reader to trust excerpts.
const Badge = styled.span<{ $read: boolean }>`
  border: 1px solid ${(props) => (props.$read ? "#bbf7d0" : "#fde68a")};
  background-color: ${(props) => (props.$read ? "#f0fdf4" : "#fffbeb")};
  border-radius: 999px;
  color: ${(props) => (props.$read ? "#166534" : "#92400e")};
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 8px;
  white-space: nowrap;
`;

const Snippet = styled.p`
  color: #4b5563;
  font-size: 13px;
  margin: 6px 0 0;
`;

interface SourceItemProps {
  readonly source: ResearchSource;
}

/** One row of the bibliography. A component rather than markup in a `.map()` — see react.md. */
export const SourceItem = memo(function SourceItem({ source }: SourceItemProps) {
  return (
    <Item>
      <Head>
        <Link href={source.url} rel="noreferrer" target="_blank">
          {source.title}
        </Link>
        <Badge $read={source.read}>{source.read ? "открыт" : "только сниппет"}</Badge>
      </Head>
      {source.snippet === undefined ? null : <Snippet>{source.snippet}</Snippet>}
    </Item>
  );
});
