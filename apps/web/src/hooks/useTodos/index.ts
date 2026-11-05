import type { Todo } from "@app/shared";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createTodo, deleteTodo, loadTodos, toggleTodo } from "#actions/todos";
import {
  selectRemainingCount,
  selectTodos,
  selectTodosError,
  selectTodosFilter,
  selectTodosLoading,
  type TodosFilter,
} from "#selectors/todos";
import type { AppDispatch } from "#store";

interface UseTodosActions {
  readonly load: (filter?: TodosFilter) => void;
  readonly create: (title: string, dueDate?: string) => void;
  readonly toggle: (todo: Todo) => void;
  readonly remove: (todo: Todo) => void;
}

interface UseTodos {
  readonly todos: readonly Todo[];
  readonly remaining: number;
  readonly loading: boolean;
  readonly error: string | undefined;
  /** Which slice of the service `todos` is. The filter control reads its own state from here. */
  readonly filter: TodosFilter;
  readonly actions: UseTodosActions;
}

// Reads through selectors, writes only by dispatching intents from `actions/todos`. Slice actions
// are a saga's business; nothing above this line may reach them.
export function useTodos(): UseTodos {
  const dispatch = useDispatch<AppDispatch>();
  const todos = useSelector(selectTodos);
  const remaining = useSelector(selectRemainingCount);
  const loading = useSelector(selectTodosLoading);
  const error = useSelector(selectTodosError);
  const filter = useSelector(selectTodosFilter);

  // Memoized once so leaf components can be `memo`-ed with stable refs. Nothing here closes over
  // `todos`, which is what keeps the reference stable as the data changes.
  const actions = useMemo<UseTodosActions>(
    () => ({
      load: (next?: TodosFilter) => dispatch(loadTodos(next ?? {})),
      create: (title: string, dueDate?: string) =>
        dispatch(createTodo({ title, ...(dueDate === undefined ? {} : { dueDate }) })),
      toggle: (todo: Todo) => dispatch(toggleTodo({ id: todo.id, status: todo.status })),
      remove: (todo: Todo) => dispatch(deleteTodo({ id: todo.id })),
    }),
    [dispatch],
  );

  return { todos, remaining, loading, error, filter, actions };
}
