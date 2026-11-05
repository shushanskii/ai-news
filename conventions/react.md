# Conventions — React

Rules for React packages. Portable to any React project; assumes [`core.md`](./core.md) and adds
nothing project-specific — for that see [`project.md`](./project.md).

## Stack additions

- **React 19**
- **styled-components** for styling
- **React Testing Library** (jsdom) on top of Vitest

## Component & hook layout

- `hooks/<name>/index.ts` and `components/<Name>/index.tsx`, following the entity-directory rule
  from [`core.md`](./core.md).
- `createGlobalStyle` and other styled primitives count as components → under `components/`.
- **Components may not import `reducers/` directly** — state reaches the UI through a hook.

## Handlers & state

- **No inline event handlers in JSX.** Every handler is a named function prefixed with `handle`
  (`handleSubmit`, `handleChange`).
- If a handler is needed inside a `.map()`, **extract a dedicated component** that owns its own
  `handleClick` rather than writing an inline arrow.
- Passing a stable callback reference down as a prop (`onChange={actions.setValue}`) is fine — the
  child names its own `handle*`.
- Business logic lives in a **pure reducer** (`reducers/`), not in components.
- Memoize action callbacks once (`useMemo`) so leaf components can be `memo`-ed with stable refs.

## Styling

- Use **transient props** (`$active`) for style-only flags so they don't leak to the DOM.
- Render user text with `{value}` (React escapes it) — never via `innerHTML`.

## UI tests

- A package's test setup wires jest-dom matchers, RTL cleanup, and the styled-components snapshot
  serializer.
- Destructure queries from the `render()` result (`const { getByRole, asFragment } = render(...)`)
  — do **not** use the global `screen`.
- **Every UI test ends with `expect(asFragment()).toMatchSnapshot()`** so behavioural and styling
  changes are visible in review. `jest-styled-components` inlines CSS with stable `c0/c1` class
  names, so snapshot diffs are readable.