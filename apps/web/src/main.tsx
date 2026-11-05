import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { App } from "#components/App";
import { GlobalStyle } from "#components/GlobalStyle";
import { createStore } from "#store";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("mount point #root not found");
}

createRoot(container).render(
  <StrictMode>
    <Provider store={createStore()}>
      {/* Mounted beside the provider, not inside `App`: the page looks the same whether the store
          is loading, erroring or empty, and `App` returns a different shape in each of those. */}
      <GlobalStyle />
      <App />
    </Provider>
  </StrictMode>,
);
