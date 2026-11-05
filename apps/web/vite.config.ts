import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Keep in sync with the prefix the clients in src/api use and with the mount in
// apps/api/src/app/index.ts. No rewrite here on purpose: the service answers the prefix it is
// given, so the dev proxy has to pass the same path the browser sent.
const apiPrefix = "/api";
const apiTarget = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      [apiPrefix]: {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
