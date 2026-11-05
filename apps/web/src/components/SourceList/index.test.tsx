import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceList } from "#components/SourceList";

describe("SourceList", () => {
  it("tells an opened page from a headline the agent only saw", () => {
    const { getAllByText, getByText, asFragment } = render(
      <SourceList
        sources={[
          {
            url: "https://example.com/opened",
            title: "Открытая страница",
            snippet: "Первый абзац страницы.",
            read: true,
          },
          { url: "https://example.com/seen", title: "Только заголовок", read: false },
        ]}
      />,
    );

    expect(getByText("Открытая страница")).toHaveAttribute("href", "https://example.com/opened");
    expect(getByText("Первый абзац страницы.")).toBeInTheDocument();
    expect(getAllByText("открыт")).toHaveLength(1);
    expect(getAllByText("только сниппет")).toHaveLength(1);
    expect(getByText("Источники: 2, открыто 1")).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });

  // An empty bibliography is the case where the summary is the model's own knowledge, and the
  // reader has to be told rather than left to notice an empty list.
  it("says so when the agent opened nothing", () => {
    const { getByText, queryAllByRole, asFragment } = render(<SourceList sources={[]} />);

    expect(getByText(/Агент не нашёл ни одной страницы/)).toBeInTheDocument();
    expect(queryAllByRole("listitem")).toHaveLength(0);
    expect(asFragment()).toMatchSnapshot();
  });
});
