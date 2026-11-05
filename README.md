# ai-news

A research agent that searches the web, opens the pages it found, and writes a digest of what is
being reported about a topic — plus the browser UI that asks it.

The agent is a LangGraph loop with two tools: **SearXNG** for search and **Crawl4AI** for reading a
page. It answers with JSON: a summary, the findings behind it, and the URLs it leaned on — each one
marked whether the agent actually opened the page or only saw a headline about it.

## Quick start

Requires **Node ≥ 22**. pnpm comes from the `packageManager` field — `corepack enable` is enough.

```bash
pnpm install
cp .env.example .env   # the defaults are the lab's own services; adjust if yours live elsewhere
pnpm dev               # service on :3000, web on :5173
```

Open <http://localhost:5173>, type a topic, press **Искать новости**. The browser calls `/api/*`,
which the Vite dev server proxies to the service with the prefix intact — no CORS, and no base URL
baked into the client. Point it somewhere else with `API_URL`.

A run takes **minutes, not seconds**: several model round trips, each one waiting on a search engine
or a headless Chromium. On the lab box a topic with four sources costs about three minutes.

## The interface

`POST /api/news` — one question in, one digest out.

```jsonc
// request
{
  "prompt": "что произошло с ценами на SSD за неделю",
  "systemPrompt": "Пиши для инженера, без пресс-релизов.",   // optional
  "tools": ["search_web", "read_page"],                       // optional, both by default
  "maxSources": 8,                                            // optional, 1..20
  "language": "ru"                                            // optional, else the prompt's own
}
```

```jsonc
// response
{
  "topic": "Цены на SSD, ноябрь 2026",
  "summary": "…",
  "keyPoints": ["…"],
  "sources": [{ "url": "https://…", "title": "…", "snippet": "…", "read": true }],
  "queries": ["ssd prices november 2026"],
  "meta": { "model": "qwen3.8-flash-next", "steps": 5, "toolCalls": 6, "durationMs": 184000, "generatedAt": "…" }
}
```

The schemas in `packages/shared` are the contract both sides compile against; the browser parses
every response through them, so a service redeployed on its own fails loudly instead of rendering
`undefined`.

Failures are JSON too, and the status says who to blame: `400` a request the schema refused, `502`
a search engine or a fetcher that failed, `504` a run the service stopped waiting for, `500` this
process's own bug.

## Packages

| Package | Path | Role | Build |
|---|---|---|---|
| `@app/shared` | `packages/shared` | types + zod schemas used by both sides | none — `exports` points at `./src/index.ts` |
| `@app/agent` | `packages/agent` | the LangGraph loop, its tools and its prompts | none — ships source |
| `@app/api` | `apps/api` | Express service, one route | `tsup` → `dist/main.js` |
| `@app/web` | `apps/web` | React SPA on Redux Toolkit + Saga | `vite build` → `dist/` |

`web` never imports `agent`: LangGraph stays out of the bundle the browser downloads. The browser
talks to the agent through HTTP and nothing else.

## How the agent works

```
START → research ──tool call──▶ tools ──▶ research
            │
            └──no tool call───▶ write_digest → END
```

`research` asks the model with its tools bound; `tools` runs whatever it asked for and answers with
a `ToolMessage` per call; the loop repeats until the model stops asking or `AGENT_MAX_STEPS` is
reached. `write_digest` sits outside the loop on purpose — summarising inside it would let the
model answer mid-search, which is the failure this shape exists to prevent. Its output is forced
through a schema by `withStructuredOutput`.

Two things the state keeps besides the transcript: the queries that were run, and the sources —
search hits recorded as unread, pages that came back through the fetcher recorded as read. The
bibliography is built from that record rather than from whatever the model chose to repeat.

A URL the model cites that no tool ever returned is dropped from the answer. The prompt forbids
inventing one, and a run that disobeyed that is exactly the run where the citation cannot be
trusted.

## Logging

Every run writes its own story to stderr, and one id ties it together:

```
INFO  research requested requestId=demo-77 prompt="чем закончился запуск Starship" maxSources=2
INFO  run started requestId=demo-77 runId=05ab2b2e tools=["search_web","read_page"]
INFO  model asked for tools requestId=demo-77 runId=05ab2b2e step=3 requested=2 durationMs=7160
INFO  tool call requestId=demo-77 runId=05ab2b2e tool=read_page url=https://… chars=73 truncated=false
INFO  digest written requestId=demo-77 runId=05ab2b2e keyPoints=7 cited=5 durationMs=41865
INFO  run finished requestId=demo-77 runId=05ab2b2e steps=8 toolCalls=14 sources=2 durationMs=100267
INFO  request requestId=demo-77 method=POST path=/api/news status=200 durationMs=100280
```

That `chars=73` above is the reason the fields exist: the page came back, it was a cookie wall, and
the run went on to answer from the other one. Without it a digest built on one real source and one
empty page looks identical to one built on two real sources.

- `LOG_LEVEL=debug` adds the health checks and the size of every model request; `LOG_FORMAT=json`
  writes one object per line, with numbers still numbers.
- The id arrives in the response header `x-request-id`, and an id the caller sent is kept rather than
  replaced — quote either one and the lines are there.
- Failures are logged where they are known, not only at the edge: `model did not answer`, `tool
  failed`, `citations dropped` (the model named a URL no tool ever returned), `run failed` with the
  failure kind the status is derived from.
- Logs go to **stderr**. stdout belongs to whatever the process was asked to produce.

## Commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | service in watch mode + Vite dev server |
| `pnpm run verify` | **the gate** — everything below, in one command |
| `pnpm run audit` | the read-only part of it: typecheck, Biome, fallow |
| `pnpm test` | Vitest in every package |
| `pnpm run build` | `tsup` and `vite build` into each app's `dist/` |
| `pnpm run fix` | Biome auto-fix (format + lint) |

### The gate

`pnpm run verify` is the single verification command, and the `pre-commit` hook runs it:

```
turbo run typecheck                types, per package
biome check .                      format + lint, whole repo
fallow dead-code --fail-on-issues  dead code, cycles, boundaries, duplicate exports
turbo run test                     Vitest, per package
turbo run build                    tsup + vite build
```

Green means types, style, structure, behaviour and both bundles all pass. Flags you add on the way
are task-runner flags: `pnpm run verify --force` re-runs the tasks instead of replaying the
Turborepo cache. `commitlint` separately rejects commit messages that are not
[Conventional Commits](https://www.conventionalcommits.org/).

**A hook is not a gate, and this repository does not rely on one.** `git commit --no-verify` skips it
in one flag, so `.github/workflows/ci.yml` runs the same `verify` on every push to `main` and on every
pull request, and `main` will not merge without a green `verify`. The setting that makes it required
is not in the repository — see
[conventions/project.md](./conventions/project.md), "CI is the gate".

## Layout

Inside every package, an entity is a **directory with an `index.ts`** — never a flat `Thing.ts`.
Which buckets a package has depends on its role:

```
packages/shared/src/   types/ schemas/
packages/agent/src/    types/ errors/ schemas/ config/ logging/ bibliography/
                       tools/ model/ state/ nodes/ edges/ graph/
apps/api/src/          app/ middleware/ routes/ services/                + main.ts
apps/web/src/          api/ actions/ reducers/ sagas/
                       store/ selectors/ hooks/ components/           + main.tsx
```

Layers only import leftwards, and fallow enforces it: one zone per bucket in `.fallowrc.json`, with
`coverage.requireAllFiles` so a bucket no zone claims is a red gate instead of an unpoliced one.
`apps/web/src/architecture/index.test.ts` asserts the rules themselves, so deleting one is a red
test rather than a quiet loss of coverage.

## Stack

TypeScript 7 · pnpm workspaces + Turborepo · Biome · Vitest + Testing Library · fallow
React 19 · Redux Toolkit + Redux Saga · styled-components · Vite
Express 5 · tsup · zod
LangChain / LangGraph 1 · `@langchain/openai` against an OpenAI-compatible endpoint

Shared dependency versions live once in the pnpm `catalog:` in `pnpm-workspace.yaml`. No package
hard-codes a version.

## Conventions

The rules are loaded into every agent session through `CLAUDE.md` → `AGENTS.md`, layered from most
portable to most project-specific:

- [`conventions/core.md`](./conventions/core.md) — any TypeScript monorepo
- [`conventions/react.md`](./conventions/react.md) — any React project
- [`conventions/redux.md`](./conventions/redux.md) — Redux Toolkit + Saga
- [`conventions/project.md`](./conventions/project.md) — only this repository

Read them before adding a package. They are short, and they describe what the code actually does —
several of the rules exist because the toolchain caught the alternative.

## Skills

`new-package` ships with the project at `.claude/skills/new-package/`, with `.agents/skills/new-package`
a symlink to the same directory. Use it when adding a package rather than improvising — it carries
the rules that fail silently, such as script names having to match the Turborepo tasks.
