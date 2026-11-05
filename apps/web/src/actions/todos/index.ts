import type { TodoStatus } from "@app/shared";

// Saga entry points, and the only actions the UI is allowed to dispatch. Declared by hand so the
// types stay enum members. Values are namespaced because Redux action types share one global space.
//
// The verbs name a user's *intent* (`createTodo`), while the slice names a *state change*
// (`addTodo`). Keeping the two vocabularies apart is what stops one identifier from meaning two
// things — fallow reports it as a duplicate export when they collide.
export enum TodosActions {
  Load = "todos/load",
  Create = "todos/create",
  Toggle = "todos/toggle",
  Delete = "todos/delete",
}

// `type`, not `interface`: Redux's `UnknownAction` carries an index signature, and TypeScript
// grants an implicit one to type aliases only — an interface here fails to dispatch.
export type LoadTodosAction = {
  readonly type: TodosActions.Load;
  readonly payload: {
    readonly status?: TodoStatus;
    /** Ask the service for only the todos whose deadline has passed. */
    readonly overdue?: boolean;
  };
};

export type CreateTodoAction = {
  readonly type: TodosActions.Create;
  readonly payload: {
    readonly title: string;
    readonly dueDate?: string;
  };
};

// Carries the current status so the saga can flip it without reading state: selectors are typed
// against RootState and therefore sit after sagas in the layer order.
export type ToggleTodoAction = {
  readonly type: TodosActions.Toggle;
  readonly payload: {
    readonly id: string;
    readonly status: TodoStatus;
  };
};

export type DeleteTodoAction = {
  readonly type: TodosActions.Delete;
  readonly payload: {
    readonly id: string;
  };
};

export function loadTodos(payload: LoadTodosAction["payload"] = {}): LoadTodosAction {
  return { type: TodosActions.Load, payload };
}

export function createTodo(payload: CreateTodoAction["payload"]): CreateTodoAction {
  return { type: TodosActions.Create, payload };
}

export function toggleTodo(payload: ToggleTodoAction["payload"]): ToggleTodoAction {
  return { type: TodosActions.Toggle, payload };
}

export function deleteTodo(payload: DeleteTodoAction["payload"]): DeleteTodoAction {
  return { type: TodosActions.Delete, payload };
}
