import { defineConfig } from "tsup";

// `@app/shared` and `@app/agent` ship raw TypeScript (exports -> ./src/index.ts), so they must be
// bundled in rather than left external. See conventions/core.md.
export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: ["@app/shared", "@app/agent"],
});
