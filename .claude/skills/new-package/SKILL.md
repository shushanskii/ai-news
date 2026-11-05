---
name: new-package
description: Add a package to this pnpm/Turborepo monorepo — a shared library, an Express service, or a React app. Use when asked to create a new package, workspace member, app, or service. Covers package.json, tsconfig, subpath imports, fallow boundary zones, the dependency catalog, and how to verify the result.
---

# Add a package

Follow this in order. Every step exists because skipping it fails silently rather than loudly.

## 1. Pick the shape

| Shape | Lives in | Emits | Copy the structure of |
|---|---|---|---|
| **library** — types, logic, anything imported by others | `packages/<name>/` | nothing | `packages/shared` |
| **service** — an HTTP process | `apps/<name>/` | `dist/main.js` via tsup | `apps/api` |
| **frontend** — a browser app | `apps/<name>/` | `dist/` via Vite | `apps/web` |

Read the reference package before writing anything — it is the authority, this file is the
checklist. If those packages were deleted from the project, the skeletons below stand alone.

If the request fits none of the three, ask rather than inventing a fourth shape.

## 2. Write `package.json`

Use the existing scope (check the root `package.json` and a sibling — it is **not** `@app` outside
the template). Every dependency is `"catalog:"`; if the version is not in the catalog yet, add it to
`pnpm-workspace.yaml` first. Never pin a version inside a package.

**library**

```jsonc
{
  "name": "@<scope>/<name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },        // libraries ship source, never dist
  "imports": { "#types/*": "./src/types/*/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": { "typescript": "catalog:", "vitest": "catalog:" }
}
```

**service** — add `"main": "./dist/main.js"`, no `exports`, plus:

```jsonc
"scripts": {
  "dev": "tsup --watch --onSuccess \"node dist/main.js\"",
  "build": "tsup",
  "typecheck": "tsc -p tsconfig.json",
  "test": "vitest run"
}
```

**frontend** — no `exports`, plus `"dev": "vite"`, `"build": "vite build"`, and the same
`typecheck`/`test`.

### Three rules that bite

- **Script names must match the Turborepo tasks** — `dev`, `build`, `typecheck`, `test`. A package
  missing `typecheck` is skipped by the gate, which then passes while checking nothing.
- **Declare `imports` one entry per bucket**, each resolving to a single concrete extension:
  `"#components/*": "./src/components/*/index.tsx"`. A catch-all `"#*": "./src/*/index.ts"` cannot
  serve both `.ts` and `.tsx`, and the array form (`["…/index.ts", "…/index.tsx"]`) resolves in
  TypeScript but **not** in Vite — typecheck goes green while the dev server and tests fail.
- **Apps take real `dependencies`; libraries take `peerDependencies` + a catalog `devDependency`.**
  An app is the final consumer; a library must not drag a second copy of React or zod along.

## 3. Write `tsconfig.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]                    // add config files a package owns: vite.config.ts, etc.
}
```

A service adds `"compilerOptions": { "lib": ["ES2022"], "types": ["node"] }`.

Do **not** turn off `noEmit`. `tsc` only typechecks in this repo; bundlers emit.

## 4. Create the buckets

Every entity is a **directory with an `index.ts(x)`** — never a flat `Thing.ts`. Use the buckets the
role needs, in the layer order from `conventions/core.md` and `conventions/redux.md`:

```
library    src/index.ts (the public barrel) + types/ schemas/
service    src/main.ts + app/ routes/ services/
frontend   src/main.tsx + api/ actions/ reducers/ sagas/ store/ selectors/ hooks/ components/
```

Only `src/index.ts` in a library is a flat file — it is the barrel, not an entity. An app's entry
(`main.ts`/`main.tsx`) is the other exception.

## 5. Add the bundler config (apps only)

**service** — `tsup.config.ts`. Workspace libraries ship raw TypeScript, so they must be inlined:

```ts
export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: ["@<scope>/<lib>"],   // without this the build emits an unresolvable import
});
```

**frontend** — `vite.config.ts` (plus a proxy if it calls a service), `vitest.config.ts` with
`environment: "jsdom"`, `globals: false` and a `setupFiles` entry, `vitest.setup.ts` wiring jest-dom
matchers, RTL `cleanup` and the styled-components serializer, and `index.html`.

## 6. Register the package

One file outside the package, and it is easy to forget:

**`.fallowrc.json`** — add a zone and a rule, per layer rather than per package: one zone per
bucket under the package's `src/`, each with an `allow` list naming only the buckets it may import.
A zone with **no rule entry is unrestricted**, so the rule is not optional — and a source file that
matches no zone is reported by `coverage.requireAllFiles`, which is what stops a new bucket from
opting out of the rules silently.

```jsonc
// boundaries.zones — one per bucket, plus the entry file
{ "name": "<name>-<bucket>", "patterns": ["<packages|apps>/<name>/src/<bucket>/**"] }
// boundaries.rules — list every zone this one may import; a zone may not need itself
{ "from": "<name>-<bucket>", "allow": ["<zones to its left>", "@<scope>/shared-barrel"] }
```

Whatever zones you add, add the matching assertions to
`apps/web/src/architecture/index.test.ts`: it is the only thing that notices a rule being deleted,
because fallow is green on any tree that does not currently break one.

You do **not** need to touch `entry`. fallow discovers entry points on its own from bundler configs
and `package.json` fields; the manual list is a fallback for a runtime root nothing declares. Add
one only if fallow actually reports your entry file as unused.

`pnpm-workspace.yaml` needs no change if the path matches `packages/*` or `apps/*`.

## 7. Verify

```bash
pnpm install          # links the workspace and resolves catalog: entries
pnpm run verify       # typecheck + biome + fallow + tests + both builds
```

Green before the package is done. `pnpm run audit` is the read-only half of the same gate — fine
while iterating, not a substitute for `verify`.

### What fallow will and will not complain about

A brand-new package that nothing imports yet is **fine**. Its `exports` barrel is an entry point, so
whatever the barrel re-exports is never "unused" — you can land the package before its first
consumer.

What does fail the gate is an **internal** export that nothing reaches: a symbol in a bucket that
the barrel does not re-export and no sibling module imports. Anything added "for later" lands here.
Delete it or wire it up; never silence it by loosening the fallow config.

If `biome check` complains about formatting, run `pnpm run fix`. Do not hand-format.

## 8. Document it

Add the package to the table in `conventions/project.md` — name, path, role, how it builds — and to
the package graph. If it introduces a rule that names a package or a domain term, that rule belongs
in `project.md`, not in the portable convention layers.