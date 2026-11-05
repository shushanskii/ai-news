import { type ChangeEvent, type FormEvent, memo, useState } from "react";
import styled from "styled-components";

const Form = styled.form`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

interface TodoFormProps {
  readonly onSubmit: (title: string, dueDate?: string) => void;
}

export const TodoForm = memo(function TodoForm({ onSubmit }: TodoFormProps) {
  // The draft title is UI state, not domain state: it never leaves this component until submit,
  // so it stays in `useState` rather than the store. Same for the draft deadline.
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value);
  }

  function handleDueDateChange(event: ChangeEvent<HTMLInputElement>) {
    setDueDate(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim().length === 0) {
      return;
    }

    // An empty date input means "no deadline", which is the same request as not filling it in.
    onSubmit(title, dueDate.length === 0 ? undefined : dueDate);
    setTitle("");
    setDueDate("");
  }

  return (
    <Form onSubmit={handleSubmit}>
      <input
        aria-label="new todo"
        onChange={handleChange}
        placeholder="what needs doing?"
        value={title}
      />
      {/* `type="date"` gives YYYY-MM-DD or nothing, which is exactly the wire format. */}
      <input aria-label="due date" onChange={handleDueDateChange} type="date" value={dueDate} />
      <button type="submit">add</button>
    </Form>
  );
});
