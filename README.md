# ts-scaffold

A working TypeScript monorepo you copy to start a new project. It is not a generator — the
repository *is* the template, so everything in it is code that builds, tests and passes its own
quality gate. If it is broken here, you would have found out the hard way in every project started
from it.

## What's in the box

Three packages, one per shape a real project needs:

| Package | Path | Role | Build |
|---|---|---|---|
| `@app/shared` | `packages/shared` | types + zod schemas used by both sides | none — `exports` points at `./src/index.ts` |
| `@app/api` | `apps/api` | Express service | `tsup` → `dist/main.js` |
| `@app/web` | `apps/web` | React SPA on Redux Toolkit + Saga | `vite build` → `dist/` |

They demonstrate one end-to-end loop: a click in the browser dispatches an intent, a saga calls the
service over HTTP, the response is validated and stored, a selector feeds it back to the UI.

## Quick start

Requires **Node ≥ 22**. pnpm comes from the `packageManager` field — `corepack enable` is enough.

```bash
pnpm install     # also installs the husky hooks
pnpm dev         # service on :3000, web on :5173
```

Open <http://localhost:5173>. The browser calls `/api/*`, which the Vite dev server proxies to the
service with the prefix stripped — no CORS, and no base URL baked into the client. Point it
somewhere else with `API_URL`.

## Making it yours

The `@app` scope and the `Todo` domain exist so the template runs. Both are meant to be deleted.

1. **Rename the workspace** — `name` in the root `package.json`.
2. **Rename the scope** — `@app/shared`, `@app/api`, `@app/web` in the three package manifests, plus
   the `@app/shared` dependency in `apps/api` and `apps/web`.
3. **Delete the example domain** — everything named `todo`/`Todo` under `packages/shared/src`,
   `apps/api/src` and `apps/web/src`, including its tests and snapshots. Keep the directory
   structure; it is the convention.
4. **Sweep up after it.** The example was the only consumer of several dependencies and exports, so
   they die with it. Run `pnpm run audit` and remove exactly what fallow names — from the package
   manifests, from the `catalog:` in `pnpm-workspace.yaml`, and from the source — then run it again
   until it is quiet. Do not work from a list: what becomes dead depends on which packages you kept.
5. **Write your first test.** Deleting the example left none, and `vitest` exits non-zero when it
   finds no test files — on purpose. `pnpm test` stays red until a real test exists, which is the
   point: the first test lands before the first feature, not after. Do not reach for
   `--passWithNoTests`; that buys a green gate by making it stop checking.
6. **Fill in `conventions/project.md`** — it is deliberately close to empty. Package names, the
   package graph, and domain terms belong there, not in the portable layers.
7. **Update the boundary zones** in `.fallowrc.json` if you add or rename packages. A package with
   no zone is a package with no enforced boundaries, and a zone with no rule entry is a zone that
   restricts nothing — fallow stays green either way as long as nothing currently breaks a rule.
   `apps/web/src/architecture/index.test.ts` is the trap for that: it asserts the rules the
   conventions claim, so hollowing the config out is a red test rather than a quiet loss of
   coverage. Rename the zones there too.

Then `pnpm run verify` should be green. If it is not, a step above was missed — fix that rather
than building on top of it.

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

`pnpm run verify` is the single verification command. The `pre-commit` hook runs it, and
`.forgejo/workflows/ci.yml` runs it on every push and pull request:

```
turbo run typecheck                types, per package
biome check .                      format + lint, whole repo
fallow dead-code --fail-on-issues  dead code, cycles, boundaries, duplicate exports
turbo run test                     Vitest, per package
turbo run build                    tsup + vite build
```

Green means types, style, structure, behaviour and both bundles all pass. Flags you add on the way
are task-runner flags: `pnpm run verify --force` re-runs the tasks instead of replaying the
Turborepo cache, which is the only way to watch the gate do the work rather than recall it.
`commitlint` separately rejects commit messages that are not
[Conventional Commits](https://www.conventionalcommits.org/).

**A hook is not a gate.** `git commit --no-verify` skips it in one flag, so the workflow is what
enforces and the hook is only the fast local pass. One setting lives outside the repository:
require the `verify` check on `main` under branch protection, or a project copied from this
template starts out unenforced all over again.

## Layout

Inside every package, an entity is a **directory with an `index.ts`** — never a flat `Thing.ts`.
Which buckets a package has depends on its role:

```
packages/shared/src/     types/ schemas/
apps/api/src/            app/ routes/ services/          + main.ts
apps/web/src/            api/ actions/ reducers/ sagas/
                         store/ selectors/ hooks/ components/   + main.tsx
```

Layers only import leftwards, and fallow enforces it: one zone per bucket in `.fallowrc.json`, with
`coverage.requireAllFiles` so a bucket no zone claims is a red gate instead of an unpoliced one.
The rules that are calls rather than imports — reading the store with an inline `useSelector`,
calling `fetch` outside `api/` — are covered by `boundaries.calls.forbidden`. In `apps/web` that
means components reach state through a hook, never through a reducer; sagas dispatch slice actions,
the UI never does.

## Stack

TypeScript 7 · pnpm workspaces + Turborepo · Biome · Vitest + Testing Library · fallow
React 19 · Redux Toolkit + Redux Saga · styled-components · Vite
Express 5 · tsup · zod

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

`new-package` ships with the project at `.claude/skills/new-package/`. Use it when adding a package
rather than improvising — it carries the rules that fail silently, such as script names having to
match the Turborepo tasks.

`.agents/skills/new-package` is a **symlink** to the same directory, so agents that read the neutral
path find it too. There is one copy of the instructions, never two to keep in step.

> On Windows, git only materialises symlinks with `core.symlinks=true` and Developer Mode enabled.
> Without them the checkout contains a text file holding the target path, and the skill silently
> fails to load. Either turn both on, or delete `.agents/` and keep only the Claude Code path.

The skill for starting a *new* project from this template lives in
[ts-scaffold-skills](https://github.com/shushanskii/ts-scaffold-skills) — it cannot ship here,
because it runs before the project exists.