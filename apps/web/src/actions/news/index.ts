import type { ResearchRequest } from "@app/shared";

// Saga entry points, and the only actions the UI is allowed to dispatch. Declared by hand so the
// types stay enum members. Values are namespaced because Redux action types share one global space.
//
// The verbs name a user's *intent* (`researchNews`), while the slice names a *state change*
// (`setResult`). Keeping the two vocabularies apart is what stops one identifier from meaning two
// things.
export enum NewsActions {
  Research = "news/research",
  Reset = "news/reset",
}

// `type`, not `interface`: Redux's `UnknownAction` carries an index signature, and TypeScript
// grants an implicit one to type aliases only — an interface here fails to dispatch.
//
// The payload is the whole request the service expects, so the saga forwards it without deciding
// anything about the form the user filled in.
export type ResearchNewsAction = {
  readonly type: NewsActions.Research;
  readonly payload: ResearchRequest;
};

export type ResetNewsAction = {
  readonly type: NewsActions.Reset;
};

export function researchNews(payload: ResearchRequest): ResearchNewsAction {
  return { type: NewsActions.Research, payload };
}

export function resetNews(): ResetNewsAction {
  return { type: NewsActions.Reset };
}
