import type { ResearchResult } from "@app/shared";
import { all, call, put, takeLatest } from "redux-saga/effects";
import { NewsActions, type ResearchNewsAction } from "#actions/news";
import { newsApi } from "#api/news";
import { clearResult, setError, setResult, setRunning } from "#reducers/news";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected error";
}

// Note the absence of `finally`: redux-saga runs it on cancellation too, so a `takeLatest` that
// superseded this task would clear the loading flag the newer request had just raised.
//
// A research run is minutes rather than milliseconds, so `takeLatest` matters: a user who changes
// the topic should not have the first answer overwrite the second.
function* researchNews(action: ResearchNewsAction) {
  yield put(setRunning(true));
  yield put(setError(undefined));

  try {
    const result: ResearchResult = yield call(newsApi.research, action.payload);

    yield put(setResult(result));
    yield put(setRunning(false));
  } catch (error) {
    yield put(setError(toMessage(error)));
    yield put(setRunning(false));
  }
}

function* resetNews() {
  yield put(clearResult());
  yield put(setError(undefined));
}

export function* rootSaga() {
  yield all([
    takeLatest(NewsActions.Research, researchNews),
    takeLatest(NewsActions.Reset, resetNews),
  ]);
}
