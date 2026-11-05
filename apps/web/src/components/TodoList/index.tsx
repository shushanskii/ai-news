import type { Todo } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";
import { TodoItem } from "#components/TodoItem";

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

interface TodoListProps {
  readonly todos: readonly Todo[];
  readonly onToggle: (todo: Todo) => void;
  readonly onRemove: (todo: Todo) => void;
}

export const TodoList = memo(function TodoList({ todos, onToggle, onRemove }: TodoListProps) {
  return (
    // `role="list"` is not decoration: `list-style: none` below makes Chrome and Safari drop the
    // list semantics, so without it a screen reader announces these todos as loose text.
    <List role="list">
      {todos.map((todo) => (
        <TodoItem key={todo.id} onRemove={onRemove} onToggle={onToggle} todo={todo} />
      ))}
    </List>
  );
});
