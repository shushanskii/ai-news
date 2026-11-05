import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@app/agent";
import { createApp } from "#app";
import { createNewsService, DEFAULT_TIMEOUT_MS } from "#services/news";

/**
 * Loads `.env` if there is one, walking up from the working directory.
 *
 * The agent reads `process.env` when a run starts, so the file has to be in place before the first
 * request rather than before the first import. Walking up is what makes `pnpm dev` from `apps/api`
 * and `node dist/main.js` from the repository root read the same file: the variables describe the
 * deployment, not the directory a script happened to start in.
 */
function loadEnv(startDirectory: string): string | undefined {
  for (let directory = startDirectory; ; directory = join(directory, "..")) {
    const candidate = join(directory, ".env");

    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);

      return candidate;
    }

    const parent = join(directory, "..");

    if (parent === directory) {
      return undefined;
    }
  }
}

const envFile = loadEnv(process.cwd());
const port = Number(process.env.PORT ?? 3000);

// One logger for the process: the request lines and the agent's run lines come out of the same
// stream, in the same format, which is the only way to read an incident as one story.
const logger = createLogger();

// A deployment on a laptop and a deployment on a GPU box differ by an order of magnitude in how
// long one run takes, so the ceiling is configuration — read here, where `PORT` is read, rather
// than inside the service.
const timeoutMs = readTimeout(process.env.NEWS_TIMEOUT_MS);

createApp(createNewsService({ timeoutMs }), logger).listen(port, () => {
  logger.info("api listening", {
    url: `http://localhost:${port}`,
    ...(envFile === undefined ? {} : { envFile }),
    timeoutMs,
  });
});

// A value that is not a number is refused out loud: a silently defaulted timeout looks exactly
// like a service that has become slow.
function readTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(value.trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`NEWS_TIMEOUT_MS wants a whole number of milliseconds, got "${value}"`);
  }

  return parsed;
}
