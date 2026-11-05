import { randomUUID } from "node:crypto";
import {
  type CreateTodo,
  type Todo,
  type TodoListQuery,
  TodoStatus,
  type UpdateTodo,
} from "@app/shared";

export interface TodosService {
  readonly list: (query: TodoListQuery) => readonly Todo[];
  readonly find: (id: string) => Todo | undefined;
  readonly create: (input: CreateTodo) => Todo;
  readonly update: (id: string, input: UpdateTodo) => Todo | undefined;
  readonly remove: (id: string) => boolean;
}

// A factory, not module-level state: every `createApp()` gets its own store, so tests start clean
// without a reset hook. Swap the body for a real repository — the interface is the seam.
//
// `now` is the second seam, and for the same reason: "overdue" is a question about today, and a
// test should not have to wait for one or race midnight to answer it.
export function createTodosService(now: () => Date = () => new Date()): TodosService {
  let todos: readonly Todo[] = [];

  function find(id: string): Todo | undefined {
    return todos.find((todo) => todo.id === id);
  }

  // Both sides are `YYYY-MM-DD`, so text order is date order and no Date needs to be parsed.
  // A todo already done has met its deadline, so it is never overdue.
  function isOverdue(todo: Todo): boolean {
    if (todo.dueDate === undefined || todo.status === TodoStatus.Done) {
      return false;
    }

    return todo.dueDate < now().toISOString().slice(0, 10);
  }

  return {
    // `?overdue` asserts a value, so false filters to the todos that are not overdue rather than
    // meaning "no filter" — only an absent parameter leaves the list alone.
    list: (query) => {
      if (query.overdue === undefined) {
        return todos;
      }

      return todos.filter((todo) => isOverdue(todo) === query.overdue);
    },
    find,
    create: (input) => {
      const todo: Todo = {
        id: randomUUID(),
        title: input.title,
        status: TodoStatus.Active,
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
      };

      todos = [...todos, todo];

      return todo;
    },
    update: (id, input) => {
      const existing = find(id);

      if (existing === undefined) {
        return undefined;
      }

      const updated: Todo = {
        ...existing,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.status === undefined ? {} : { status: input.status }),
        // null takes the deadline off, an absent key leaves it — the schema keeps them apart.
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate ?? undefined }),
      };

      todos = todos.map((todo) => (todo.id === id ? updated : todo));

      return updated;
    },
    remove: (id) => {
      const remaining = todos.filter((todo) => todo.id !== id);
      const removed = remaining.length < todos.length;
      todos = remaining;
      return removed;
    },
  };
}
