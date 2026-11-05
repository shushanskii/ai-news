# Conventions — core

The **HOW** for any TypeScript monorepo in this workspace: structure, tooling, tests, gates.
Stack-agnostic — nothing here names a framework, a package, or a domain term.

React-specific rules live in [`react.md`](./react.md); anything tied to this particular project
lives in [`project.md`](./project.md).

## Stack

- **TypeScript** (strict) throughout
- **pnpm** workspaces (monorepo) + **Turborepo** (task running/caching)
- **Biome** for formatting + linting
- **Vitest** for tests
- **fallow** for structural analysis / dead code / architecture boundaries

## Monorepo mechanics

- **Workspaces:** `packages/*` (libraries), `apps/*` (deployables). Declared in
  `pnpm-workspace.yaml`.
- **Shared dependency versions** live once in the pnpm `catalog:` (`pnpm-workspace.yaml`). Every
  package — including the workspace root — references them as `"some-dep": "catalog:"`, never a
  hard-coded version.
- **Cross-package imports use the package name**, never a relative path across packages:
  `import { Todo } from "@scope/shared"` — not `../../shared/src`.
- **Intra-package imports use subpath imports**, declared per bucket in the package's `imports`
  field: `import { x } from "#reducers/todo"` — not `../../reducers/todo`.

  Declare **one entry per bucket**, each resolving to a single concrete extension:

  ```json
  "imports": {
    "#components/*": "./src/components/*/index.tsx",
    "#reducers/*": "./src/reducers/*/index.ts",
    "#store": "./src/store/index.ts"
  }
  ```

  A single catch-all `"#*": "./src/*/index.ts"` cannot serve both `.ts` and `.tsx`, and the array
  form (`["./src/*/index.ts", "./src/*/index.tsx"]`) is resolved by TypeScript but **not** by Vite —
  typecheck passes while the dev server and tests fail to resolve. Keep the mapping explicit.
- **A package's public API is its `exports`.** Only what a package's `exports` (its `src/index.ts`
  barrel) exposes may be imported by others; internals stay private. Apps declare no `exports` —
  nothing imports them.

### Building

- **`tsc` never emits.** `noEmit: true` lives in `tsconfig.base.json` and stays on everywhere; `tsc`
  is only ever a typechecker. Emitting is a bundler's job.
- **Libraries ship source.** `exports` points at `./src/index.ts`; there is no `build` task and no
  `.d.ts`. Consumers compile it themselves.
- **Apps bundle to `dist/`.** Because libraries ship raw TypeScript, an app's bundler must pull that
  source *in* rather than treat it as external — Vite does this by default, `tsup` needs
  `noExternal: ["@scope/<lib>"]`. A plain `tsc --outDir` build cannot consume a source-only package.
- Libraries take shared runtime deps as **`peerDependencies`** + a catalog `devDependency`, never
  bundled. Apps are the final consumer, so they take real `dependencies`.

## Package internals

Within each package's `src/`, every entity is a **directory** containing an `index.ts(x)` — never a
flat `Thing.ts`:

```
packages/<pkg>/src/
├── index.ts(x)               # the package's public barrel (exports)
├── types/<entity>/index.ts   # enums, interfaces, unions — pure types, no behaviour
├── schemas/<entity>/index.ts # runtime validation for wire formats + the DTOs inferred from it
├── reducers/<entity>/index.ts# reducer + initialState (behaviour, no framework)
├── hooks/<entity>/index.ts   # framework hooks that consume reducers
└── components/<Name>/index.tsx
```

- Not every package has every bucket — use the buckets a package's role needs. A logic-only package
  may have just `types/`/`reducers/`; a UI package just `components/`/`hooks/`.
- **Component** directories are `PascalCase`; everything else is named after its entity
  (`hooks/useTodos/`, `reducers/todo/`, `types/todo/`).

### Layer direction (within a package)

`types → schemas → reducers → hooks → components`. A layer may import only from layers to its left.
A **schema is behaviour, not a type** — it exists at runtime, so it never lives in `types/`. Infer
request/response DTOs from the schema rather than declaring them twice. Notably
**components may not import `reducers/` directly** — state logic reaches the UI through a hook.
fallow boundary zones enforce this per bucket, one zone per layer, in the root `.fallowrc.json`.

## Data modeling

- **No string literals as domain values.** Use `enum` (e.g. `TodoStatus`). Reducer action `type`
  fields must be enum members, not raw strings.
- **All types and enums live in `types/<entity>`**, separate from behaviour.
- State interfaces are `readonly`; produce new state with spreads, never mutate.
- Business logic lives in a **reducer** (`reducers/`), never in UI or transport code.

These last three describe hand-written reducers. A state library may satisfy them differently — see
[`redux.md`](./redux.md) for how Redux Toolkit does, and where it deliberately does not.

## Testing

- **Vitest**. Test globals are **off** — import `describe`/`it`/`expect`/`vi` explicitly.
- **Co-locate** tests as `index.test.ts(x)` inside the entity folder next to `index.ts(x)`.
- **Reducer/pure tests**: build state as literals with fixed ids (don't go through
  `crypto.randomUUID`), and assert immutability + reference stability on no-ops (`toBe(prevState)`).

## Verification & the gate

Before considering any change done, run from the **repo root**:

```bash
pnpm run verify          # the gate: audit + tests + both builds
pnpm run verify --force  # the same, ignoring the Turborepo cache
```

- **`pnpm run verify`** is the single verification gate: `turbo run typecheck` → `biome check .` →
  `fallow dead-code --fail-on-issues` → `turbo run test` → `turbo run build`. Green `verify` =
  types, style, structure, behaviour and both bundles all pass.
- **`pnpm run audit`** is the read-only half of it — typecheck, Biome, fallow — and the one to
  reach for while iterating. Green `audit` says nothing about whether the tests pass or the apps
  still bundle, so it is never the last command before a commit.
- Flags you add are forwarded to the task runner only: `--force` reaches turbo, not Biome or
  fallow. That routing is `scripts/gate.mjs`, and it exists because a chained script string appends
  the flag to the last tool in the chain instead.
- **A hook is not a gate.** `git commit --no-verify` skips it. `.forgejo/workflows/ci.yml` runs the
  same `verify` on every push and pull request, and branch protection on `main` is what makes it
  required — that one setting is not in the repository.
- **`pnpm run fix`** = `biome check --write .` (auto-fix lint + format). fallow's own fixes remove
  code, so run `fallow fix` deliberately — never as part of `fix`.
- Biome: 2-space indent, double quotes, semicolons, `useNamingConvention` with `strictCase: false`
  (acronyms like HTML/URL/ID and DOM interface augmentation allowed). Let Biome own import ordering.
- **Always use block statements.** Every `if`/`else`/`for`/`while` body is wrapped in braces with
  the body on its own line — never a single-line `if (x) doThing()`. Enforced by Biome's
  `useBlockStatements`.

## fallow (structural analysis)

fallow runs as both an MCP server (interactive) and inside the gate:

- **`fallow dead-code --fail-on-issues`** — expect `No issues found`: no unused exports/files/deps,
  no unresolved imports, no circular deps, no boundary violations.
- **`guard`** (MCP) — check architecture rules that apply to a file **before editing it**.
- Boundaries — between packages, and between the layers inside one package — live in the root
  `.fallowrc.json`; the concrete package graph is documented in [`project.md`](./project.md).
- Two details of the config are easy to lose and impossible for fallow to notice: **a zone with no
  rule entry is unrestricted**, and a file matching no zone is unrestricted too. That is why
  `coverage.requireAllFiles` is on, and why `apps/web/src/architecture/index.test.ts` asserts the
  rules themselves — deleting one leaves fallow green on a tree that does not yet break it.
- Boundary checks only see code reachable from an entry point; a dead file with a violation is
  caught by the unused-file check instead. Both are in the same command, which is the point.
- Other useful tools: `find_dupes`, `check_health`, `inspect_target` / `impact`.

## Git & commits

- **Conventional Commits**: `type(scope): subject`. Types: `feat`, `fix`, `chore`, `docs`,
  `refactor`, `test`, `style`, `perf`. Scope lowercase; subject imperative, lowercase, no period.
- Default branch is `main`; branch off it rather than committing straight to `main`.
- Enforced automatically: **commitlint** on a **husky** `commit-msg` hook rejects non-conforming
  messages; the **`pre-commit`** hook runs `pnpm run verify`. Hooks activate after `pnpm install`.
  Both are conveniences — CI runs the same gate and cannot be argued with.

```
feat(core): add field validation rules
fix(ui): reset the input on submit
chore(repo): set up pnpm + turborepo monorepo
```