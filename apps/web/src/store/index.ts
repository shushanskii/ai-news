import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { newsReducer } from "#reducers/news";
import { rootSaga } from "#sagas/news";

export function createStore() {
  const sagaMiddleware = createSagaMiddleware();

  const store = configureStore({
    reducer: { news: newsReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
  });

  sagaMiddleware.run(rootSaga);

  return store;
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
