import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchForm } from "#components/ResearchForm";

describe("ResearchForm", () => {
  it("submits the prompt with both tools and the default ceiling", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });
    fireEvent.click(getByText("Искать новости"));

    expect(handleSubmit).toHaveBeenCalledExactlyOnceWith({
      prompt: "цены на SSD",
      tools: ["search_web", "read_page"],
      maxSources: 8,
    });
    expect(asFragment()).toMatchSnapshot();
  });

  // The service refuses a prompt this short; sending it costs a round trip to hear it.
  it("does not submit a prompt too short to search for", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByRole, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "  ai  " } });

    const submit = getByRole("button", { name: "Искать новости" });

    expect(submit).toBeDisabled();

    fireEvent.click(submit);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(asFragment()).toMatchSnapshot();
  });

  it("trims the prompt before sending it", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "  цены на SSD  " } });
    fireEvent.click(getByText("Искать новости"));

    expect(handleSubmit.mock.calls[0]?.[0].prompt).toBe("цены на SSD");
    expect(asFragment()).toMatchSnapshot();
  });

  it("leaves the system prompt and the language out when they were left blank", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });
    fireEvent.change(getByLabelText("Системный промпт"), { target: { value: "   " } });
    fireEvent.click(getByText("Искать новости"));

    const request = handleSubmit.mock.calls[0]?.[0];

    expect(request).not.toHaveProperty("systemPrompt");
    expect(request).not.toHaveProperty("language");
    expect(asFragment()).toMatchSnapshot();
  });

  it("sends the system prompt and the language that were filled in", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });
    fireEvent.change(getByLabelText("Системный промпт"), {
      target: { value: "Пиши для инженера." },
    });
    fireEvent.change(getByLabelText("Язык ответа"), { target: { value: "ru" } });
    fireEvent.change(getByLabelText("Источников не больше"), { target: { value: "3" } });
    fireEvent.click(getByText("Искать новости"));

    expect(handleSubmit.mock.calls[0]?.[0]).toEqual({
      prompt: "цены на SSD",
      systemPrompt: "Пиши для инженера.",
      tools: ["search_web", "read_page"],
      maxSources: 3,
      language: "ru",
    });
    expect(asFragment()).toMatchSnapshot();
  });

  it("sends only the tools left checked", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByRole, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.click(getByRole("checkbox", { name: /Поиск/ }));
    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });
    fireEvent.click(getByText("Искать новости"));

    expect(handleSubmit.mock.calls[0]?.[0].tools).toEqual(["read_page"]);
    expect(asFragment()).toMatchSnapshot();
  });

  // A run takes minutes; a second one started while the first is going answers twice for one
  // question and shows the older answer last.
  it("locks the form while a run is going", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByRole, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={true} />,
    );

    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });

    expect(getByRole("button")).toBeDisabled();
    expect(getByRole("button")).toHaveTextContent("Ищу");
    expect(asFragment()).toMatchSnapshot();
  });

  it("refuses to submit with no tool at all", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByRole, getByText, asFragment } = render(
      <ResearchForm onSubmit={handleSubmit} running={false} />,
    );

    fireEvent.click(getByRole("checkbox", { name: /Поиск/ }));
    fireEvent.click(getByRole("checkbox", { name: /Чтение страниц/ }));
    fireEvent.change(getByLabelText("Тема"), { target: { value: "цены на SSD" } });

    expect(
      getByText("Без инструментов агенту нечем искать — оставьте хотя бы один."),
    ).toBeInTheDocument();
    expect(getByRole("button")).toBeDisabled();
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(asFragment()).toMatchSnapshot();
  });
});
