#!/usr/bin/env node
// The repository's gate, in one place, so the pre-commit hook, CI and a human at a keyboard all
// run the same thing.
//
// Flags given to `pnpm run audit` / `pnpm run verify` are task-runner flags. They go to every
// turbo task and nowhere else. That routing is the whole reason this file exists: a chained
// script (`turbo run typecheck && biome check . && fallow …`) receives appended arguments at the
// end of the chain, so `pnpm run audit --force` asked `fallow` for a `--force` flag it does not
// have, and the one invocation that proves the gate is not replaying a cache was the one that
// could not be run.

import { spawnSync } from "node:child_process";

const [gate = "verify", ...turboFlags] = process.argv.slice(2);

const AUDIT = [
  ["types", "turbo", ["run", "typecheck", ...turboFlags]],
  ["style", "biome", ["check", "."]],
  ["structure", "fallow", ["dead-code", "--fail-on-issues"]],
];

const GATES = {
  // Read-only checks: types, style, structure.
  audit: AUDIT,
  // Everything that has to be true before a commit is worth reviewing.
  verify: [
    ...AUDIT,
    ["tests", "turbo", ["run", "test", ...turboFlags]],
    ["build", "turbo", ["run", "build", ...turboFlags]],
  ],
};

if (!Object.hasOwn(GATES, gate)) {
  console.error(`unknown gate "${gate}" — expected one of: ${Object.keys(GATES).join(", ")}`);
  process.exit(2);
}

for (const [label, command, args] of GATES[gate]) {
  console.log(`\n── ${label}: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error !== undefined) {
    console.error(`${label}: could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
