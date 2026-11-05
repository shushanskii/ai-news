import type { ResearchResult } from "@app/shared";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface NewsState {
  /** The last answer that came back. A failed run leaves the previous one on screen. */
  readonly result: ResearchResult | undefined;
  readonly running: boolean;
  readonly error: string | undefined;
}

export const initialState: NewsState = {
  result: undefined,
  running: false,
  error: undefined,
};

// Dispatched by sagas only — never by a component or a hook. Named `[verb][Entity]` like any other
// function, and each one does exactly what its name says: no reducer clears a flag on the side.
// Payloads carry what the server returned, so the store never guesses the outcome of a request.
const newsSlice = createSlice({
  name: "news",
  initialState,
  reducers: {
    setRunning(state, action: PayloadAction<boolean>) {
      state.running = action.payload;
    },
    setError(state, action: PayloadAction<string | undefined>) {
      state.error = action.payload;
    },
    setResult(state, action: PayloadAction<ResearchResult>) {
      state.result = action.payload;
    },
    // Drops the answer, not the error: "clear" is what the user pressed because the answer is
    // wrong, and a stale error beside an empty page reads as if clearing itself failed.
    clearResult(state) {
      state.result = undefined;
    },
  },
});

export const { setRunning, setError, setResult, clearResult } = newsSlice.actions;
export const newsReducer = newsSlice.reducer;
