import type { Todo, TodoStatus } from "@app/shared";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface TodosState {
  readonly items: readonly Todo[];
  readonly loading: boolean;
  readonly error: string | undefined;
  /**
   * Which slice of the service `items` came from, so the UI can say what it is looking at. Kept in
   * the store rather than in the component because it decides what a reload fetches: two components
   * showing the list have to agree on it. An absent field means the whole list.
   */
  readonly filter: {
    readonly status?: TodoStatus;
    readonly overdue?: boolean;
  };
}

export const initialState: TodosState = {
  items: [],
  loading: false,
  error: undefined,
  filter: {},
};

// Dispatched by sagas only — never by a component or a hook. Named `[verb][Entity]` like any other
// function, and each one does exactly what its name says: no reducer clears a flag on the side.
// Payloads carry what the server returned, so the store never guesses the outcome of a request.
const todosSlice = createSlice({
  name: "todos",
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
    },
    setTodos(state, action: PayloadAction<readonly Todo[]>) {
      // Copied, not aliased: the state is `readonly`, an Immer draft is not.
      state.items = [...action.payload];
    },
    // Records what was asked for, separately from what came back: the same filter can return a
    // different list an hour later, and the label would be lying.
    setFilter(state, action: PayloadAction<TodosState["filter"]>) {
      state.filter = action.payload;
    },
    addTodo(state, action: PayloadAction<Todo>) {
      state.items.push(action.payload);
    },
    replaceTodo(state, action: PayloadAction<Todo>) {
      const index = state.items.findIndex((item) => item.id === action.payload.id);

      if (index === -1) {
        return;
      }

      state.items[index] = action.payload;
    },
    removeTodo(state, action: PayloadAction<string>) {
      const remaining = state.items.filter((item) => item.id !== action.payload);

      if (remaining.length === state.items.length) {
        return;
      }

      state.items = remaining;
    },
  },
});

export const { setLoading, setError, setTodos, setFilter, addTodo, replaceTodo, removeTodo } =
  todosSlice.actions;
export const todosReducer = todosSlice.reducer;
