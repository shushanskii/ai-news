import { createGlobalStyle } from "styled-components";

// A component by the conventions' definition (`conventions/react.md`: styled primitives live under
// `components/`), and the only place in `web` that styles an element it does not own. That reach is
// why `button`, `input`, `textarea` and `select` are styled here rather than per component: the
// plain elements in the form have no styled wrapper of their own, and a page of browser-default
// controls is what makes the running app look unstyled. A styled component that needs a quieter
// control overrides these rules by class, which wins on specificity.
export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  body {
    background-color: #f4f5f7;
    color: #16181d;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    margin: 0;
    min-height: 100vh;
    padding: 0;
  }

  p {
    margin: 16px 0;
  }

  /* The service's error is the one paragraph that has to stand out, and it already carries the
     role to match on — so this stays in step with it. */
  [role="alert"] {
    color: #b42318;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  input,
  select,
  textarea {
    background-color: #ffffff;
    border: 1px solid #d6dae1;
    border-radius: 6px;
    color: inherit;
    padding: 7px 10px;
  }

  textarea {
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: #9aa2b1;
  }

  button {
    align-self: start;
    background-color: #2563eb;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    padding: 7px 14px;
    transition: background-color 120ms ease-in-out;
  }

  button:hover:not(:disabled) {
    background-color: #1d4ed8;
  }

  /* A run takes minutes, and a button that still looks pressable while one is going is an
     invitation to start a second. */
  button:disabled {
    background-color: #9aa2b1;
    cursor: progress;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #4c8dff;
    outline-offset: 1px;
  }
`;
