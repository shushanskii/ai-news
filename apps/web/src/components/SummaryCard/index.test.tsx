import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryCard } from "#components/SummaryCard";

const meta = {
  model: "qwen3.8-flash-next",
  steps: 4,
  toolCalls: 7,
  durationMs: 12_400,
  generatedAt: "2026-11-04T10:00:00.000Z",
};

describe("SummaryCard", () => {
  it("shows the answer and how it was produced", () => {
    const { getByRole, getByText, asFragment } = render(
      <SummaryCard
        keyPoints={["Один завод запланирован на 2027 год."]}
        meta={meta}
        summary="За месяц объявили о двух пилотах."
        topic="Батареи для сетей"
      />,
    );

    expect(getByRole("heading", { name: "Батареи для сетей" })).toBeInTheDocument();
    expect(getByText("За месяц объявили о двух пилотах.")).toBeInTheDocument();
    expect(getByText("Один завод запланирован на 2027 год.")).toBeInTheDocument();
    // The counters are the receipts: two tool calls and eleven are different confidence.
    expect(getByText("qwen3.8-flash-next")).toBeInTheDocument();
    expect(getByText("7")).toBeInTheDocument();
    expect(getByText("12 с")).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });

  it("leaves the findings list out when there are none", () => {
    const { queryByRole, asFragment } = render(
      <SummaryCard keyPoints={[]} meta={meta} summary="Ничего не нашлось." topic="Пусто" />,
    );

    expect(queryByRole("list")).toBeNull();
    expect(asFragment()).toMatchSnapshot();
  });
});
