import styled from "styled-components";
import { ResearchForm } from "#components/ResearchForm";
import { ResultJson } from "#components/ResultJson";
import { SourceList } from "#components/SourceList";
import { SummaryCard } from "#components/SummaryCard";
import { useNews } from "#hooks/useNews";

const Page = styled.main`
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  display: grid;
  gap: 20px;
  margin: 40px auto;
  max-width: 760px;
  padding: 24px 28px 32px;
`;

const Title = styled.h1`
  font-size: 20px;
  margin: 0;
`;

const Lead = styled.p`
  color: #6b7280;
  font-size: 13px;
  margin: -12px 0 0;
`;

const Running = styled.p`
  color: #4b5563;
  margin: 0;
`;

const Answer = styled.div`
  display: grid;
  gap: 18px;
`;

const Reset = styled.button`
  background-color: #ffffff;
  border: 1px solid #d6dae1;
  color: #4b5563;
  justify-self: start;

  &:hover:not(:disabled) {
    background-color: #f9fafb;
  }
`;

export function App() {
  const { result, running, error, actions } = useNews();

  function handleReset() {
    actions.reset();
  }

  return (
    <Page>
      <Title>Новости по теме</Title>
      <Lead>
        Агент ищет в интернете, открывает страницы и пишет сводку по тому, что на них написано.
        Поиск занимает минуты, а не секунды.
      </Lead>

      <ResearchForm onSubmit={actions.research} running={running} />

      {error === undefined ? null : <p role="alert">{error}</p>}
      {running ? <Running>Ищу: поиск, чтение страниц, потом сводка.</Running> : null}

      {result === undefined ? null : (
        <Answer>
          <SummaryCard
            keyPoints={result.keyPoints}
            meta={result.meta}
            summary={result.summary}
            topic={result.topic}
          />
          <SourceList sources={result.sources} />
          <ResultJson result={result} />
          <Reset onClick={handleReset} type="button">
            Убрать результат
          </Reset>
        </Answer>
      )}
    </Page>
  );
}
