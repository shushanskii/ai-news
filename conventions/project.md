# Conventions — project

Rules that only make sense for *this* repository. `ts-scaffold` is where it came from; the example
`Todo` domain is gone and the domain here is a research agent that reads the web.

Ownership rule: **if a rule names a package or a domain term, it belongs here** — not in
[`core.md`](./core.md), [`react.md`](./react.md), or [`redux.md`](./redux.md).

## Package graph

Four packages. Boundaries are enforced by the zones in the root `.fallowrc.json`.

| Package | Path | Role | Build |
|---|---|---|---|
| `@app/shared` | `packages/shared` | the wire contract: domain types + zod schemas | none — `exports` points at `./src/index.ts` |
| `@app/agent` | `packages/agent` | the LangGraph loop, its tools, its prompts | none — `exports` points at `./src/index.ts` |
| `@app/api` | `apps/api` | Express service, one route | `tsup` → `dist/main.js` |
| `@app/web` | `apps/web` | React + RTK + Saga SPA | `vite build` → `dist/` |

```
@app/shared ← @app/agent ← @app/api
             ← @app/api
             ← @app/web
```

`api` and `web` never import each other, and **`web` never imports `agent`**: the browser reaches
the agent over HTTP, which is what keeps LangGraph out of the bundle it downloads. `shared` imports
nothing.

`agent` takes the LangChain packages as `peerDependencies` and `apps/api` declares them for real —
the same split `shared` uses for zod, so one copy is resolved and the app stays the final consumer.

## Buckets by package

- `shared` — `types/` (the domain model) and `schemas/` (**zod** schemas for request and response
  bodies, plus the DTOs inferred from them). zod is a `peerDependency` here and a real dependency of
  both apps, so there is only ever one copy.
- `agent` — `types/ errors/ schemas/ config/ logging/ bibliography/ tools/ model/ state/ nodes/ edges/
  graph/`, in that import order. The public API is `runResearch`, `loadConfig`, `createLogger`,
  `AgentError` and `AgentFailure`; nothing about LangGraph crosses the barrel.
- `api` — `app/` (the Express instance, no `listen`), `middleware/`, `routes/`, `services/`. Entry is
  `src/main.ts`, which binds the port, reads `.env` and is the only file that does.
- `web` — the Redux layout from [`redux.md`](./redux.md). Entry is `src/main.tsx`.

## The agent's own rules

- **A node is a factory over its dependencies** (`createResearchNode(model)`), never a module-level
  constant. A graph built per request is what lets a request carry its own system prompt and tool
  selection without a global, and it costs nothing to compile.
- **A node may not be named after a state channel.** LangGraph refuses it at `addNode`, and the
  collision is easy to hit: the channel is `digest`, so the node is `write_digest`.
- **Tools return typed outcomes, not strings.** The tool node formats the `ToolMessage` and records
  the bibliography from the same value, so the model's text and the run's record cannot drift apart.
- **Everything an external service answers is parsed** — SearXNG and Crawl4AI are other people's
  processes. A row that fails to parse is dropped; a response that fails to parse at all is an
  `AgentError`.
- **Failures leave as `AgentError` with an `AgentFailure`.** The route maps that onto a status; a
  bare `throw` from a tool becomes a 500 and blames this service for someone else's outage.
- **`satisfies`, not a `ZodType<T>` annotation**, for a schema that feeds a LangGraph channel or an
  Immer draft. The annotation erases the concrete schema type, and the channel then infers `any`
  and stops checking updates. It goes on the closing line: the parser reads a `satisfies` at the
  start of a line as a new statement.

## Logging

`@app/agent` owns a six-method `Logger` and nothing else: no dependency, no global, no console call
anywhere else in the workspace.

- **Nodes take a logger, they do not import one.** Every node factory ends in
  `logger: Logger = silentLogger`, so a unit test of a node is silent unless it says otherwise, and a
  node that logs can never be the reason a test suite prints noise.
- **The caller binds the ids.** `runResearch` puts a `runId` on a `child` logger once, and the HTTP
  middleware puts a `requestId` on one per request; a node three calls deep adds neither. A field
  threaded through parameters is a field that gets dropped.
- **`console` is a bug.** The one exception is `main.ts`, which has no logger to reach before the
  logger exists — and even there the startup line goes through it.
- **Counts and addresses, never payloads.** A page of markdown in a log line pushes the six lines
  that explain it off the screen; the length of the page is the useful part, and the transcript is on
  `debug`.

## The `@app/*` scope is still the template's

Renaming it (`@app` → something this project owns) touches the four package manifests, every
`@app/shared` import, and `noExternal` in `apps/api/tsup.config.ts`. It has not been done here: the
scope is a name, not a boundary, and the rename is best done alone rather than mixed into a feature.

## CI is not running

There is no pipeline in this repository. The template's Forgejo workflow was deleted with the rest of
the Forgejo-era manifests, and nothing replaces it: `pnpm run verify` runs from the `pre-commit` hook,
which `--no-verify` skips, and from whoever types it.

What a first workflow has to do is already known — run `pnpm install --frozen-lockfile` and
`pnpm run verify` on every push and pull request — and one thing outside the repository matters more
than the file: on the free plan, branch protection exists only in public repositories, so the rule
"`verify` must be green before merge" is enforceable here and would silently disappear if the
repository were made private.
