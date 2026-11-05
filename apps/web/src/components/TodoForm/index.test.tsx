import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoForm } from "#components/TodoForm";

describe("TodoForm", () => {
  it("submits the title and clears the input", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(<TodoForm onSubmit={handleSubmit} />);

    const input = getByLabelText("new todo");

    fireEvent.change(input, { target: { value: "read the conventions" } });
    fireEvent.click(getByText("add"));

    expect(handleSubmit).toHaveBeenCalledExactlyOnceWith("read the conventions", undefined);
    expect(input).toHaveValue("");
    expect(asFragment()).toMatchSnapshot();
  });

  it("sends the due date with the title and clears both", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(<TodoForm onSubmit={handleSubmit} />);

    fireEvent.change(getByLabelText("new todo"), { target: { value: "file taxes" } });
    fireEvent.change(getByLabelText("due date"), { target: { value: "2026-10-20" } });
    fireEvent.click(getByText("add"));

    expect(handleSubmit).toHaveBeenCalledExactlyOnceWith("file taxes", "2026-10-20");
    expect(getByLabelText("due date")).toHaveValue("");
    expect(asFragment()).toMatchSnapshot();
  });

  it("ignores a blank title", () => {
    const handleSubmit = vi.fn();

    const { getByLabelText, getByText, asFragment } = render(<TodoForm onSubmit={handleSubmit} />);

    fireEvent.change(getByLabelText("new todo"), { target: { value: "   " } });
    fireEvent.click(getByText("add"));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(asFragment()).toMatchSnapshot();
  });
});
