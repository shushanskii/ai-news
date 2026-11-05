import { type Todo, TodoStatus } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";

const Item = styled.li`
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  display: flex;
  gap: 8px;
  padding: 10px 0;

  &:last-child {
    border-bottom: 0;
  }
`;

const Title = styled.span<{ $done: boolean }>`
  color: ${({ $done }) => ($done ? "#8b93a1" : "inherit")};
  cursor: pointer;
  flex: 1;
  text-decoration: ${({ $done }) => ($done ? "line-through" : "none")};
`;

const DueDate = styled.small`
  color: #6b7280;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
`;

// Removing is a quieter action than the primary buttons `GlobalStyle` styles, so it opts out of
// their look here rather than making them plainer for everything else.
const Remove = styled.button`
  background-color: transparent;
  border: 0;
  border-radius: 4px;
  color: #9aa2b1;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;

  &:hover {
    background-color: #f3f4f6;
    color: #b42318;
  }
`;

interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (todo: Todo) => void;
  readonly onRemove: (todo: Todo) => void;
}

export const TodoItem = memo(function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  function handleToggle() {
    onToggle(todo);
  }

  function handleRemove() {
    onRemove(todo);
  }

  return (
    <Item>
      <Title $done={todo.status === TodoStatus.Done} onClick={handleToggle}>
        {todo.title}
      </Title>
      {/*
        Printed, not judged. Whether a date has passed is decided by the service's clock and nowhere
        else; a second copy of that comparison here would be a second clock to disagree with.
      */}
      {todo.dueDate === undefined ? null : <DueDate>due {todo.dueDate}</DueDate>}
      <Remove aria-label={`remove ${todo.title}`} onClick={handleRemove} type="button">
        ×
      </Remove>
    </Item>
  );
});
