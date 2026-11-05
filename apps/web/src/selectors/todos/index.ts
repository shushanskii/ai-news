import { type Todo, TodoStatus } from "@app/shared";
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "#store";

// The UI reads through selectors. Never `useSelector((state) => state.todos.items)` inline —
// call a named selector from here.

/**
 * Which slice of the service the store is holding. Derived from `RootState` rather than imported
 * from `reducers/`: selectors sit after `store/` so that they never reach back into it, and the
 * store's shape is the one place that says what a filter is.
 */
export type TodosFilter = RootState["todos"]["filter"];

// Plain reads: they return what is already in the store, so there is nothing to memoize.
export function selectTodos(state: RootState): readonly Todo[] {
  return state.todos.items;
}

export function selectTodosFilter(state: RootState): TodosFilter {
  return state.todos.filter;
}

export function selectTodosLoading(state: RootState): boolean {
  return state.todos.loading;
}

export function selectTodosError(state: RootState): string | undefined {
  return state.todos.error;
}

// Derived: `createSelector` recomputes only when `items` changes identity. Without it every
// render would recompute, and any selector returning a fresh array or object would hand consumers
// a new reference each time and defeat `memo`.
export const selectRemainingCount = createSelector([selectTodos], (todos) => {
  return todos.filter((todo) => todo.status === TodoStatus.Active).length;
});
