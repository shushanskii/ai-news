import type { RootState } from "#store";

// The UI reads through selectors. Never `useSelector((state) => state.news.result)` inline — call
// a named selector from here.
//
// All three are plain reads: they hand back what is already in the store, so there is nothing to
// memoize. The one derivation this screen needs — splitting opened pages from headlines the agent
// only saw — is a presentation detail of `SourceList`, which owns both halves of it.
export function selectNewsResult(state: RootState) {
  return state.news.result;
}

export function selectNewsRunning(state: RootState): boolean {
  return state.news.running;
}

export function selectNewsError(state: RootState): string | undefined {
  return state.news.error;
}
