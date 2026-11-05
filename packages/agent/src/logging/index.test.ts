import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type Logger, silentLogger } from "#logging";

/** Everything a logger wrote, newest last. */
function capture(level: "debug" | "info" | "warn" | "error" | "silent" = "debug") {
  const lines: string[] = [];
  const logger = createLogger({ level, write: (line) => lines.push(line) });

  return { logger, lines };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createLogger", () => {
  it("drops what is below the level", () => {
    const { logger, lines } = capture("info");

    logger.debug("counting", { n: 1 });
    logger.info("asked", { n: 2 });
    logger.warn("slow", { n: 3 });
    logger.error("dead", { n: 4 });

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("asked");
    expect(lines[2]).toContain("dead");
  });

  it("writes nothing at silent", () => {
    const { logger, lines } = capture("silent");

    logger.error("a run failed");

    expect(lines).toEqual([]);
  });

  it("renders a line a terminal can be read in", () => {
    const { logger, lines } = capture();

    logger.info("run finished", { steps: 8, topic: "grid batteries" });

    expect(lines[0]).toMatch(
      /^\d{4}-\d\d-\d\dT[\d:.]+Z INFO {2}run finished steps=8 topic="grid batteries"$/,
    );
  });

  it("renders one JSON object per line when asked", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      format: "json",
      write: (line) => lines.push(line),
    });

    logger.warn("tool failed", {
      tool: "read_page",
      requestId: "r-1",
      attempts: 2,
      truncated: false,
    });

    const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>;

    // A duration that arrives as a string cannot be averaged or alerted on without every query
    // rewriting it first.
    expect(parsed).toMatchObject({
      level: "warn",
      msg: "tool failed",
      tool: "read_page",
      requestId: "r-1",
      attempts: 2,
      truncated: false,
    });
    expect(parsed.ts).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("keeps a field from overwriting the envelope", () => {
    const lines: string[] = [];
    const logger = createLogger({ format: "json", write: (line) => lines.push(line) });

    logger.info("hostile", { level: "error", msg: "not the message" });

    const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>;

    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hostile");
  });

  it("carries a child's fields on every line and lets the child win", () => {
    const { logger, lines } = capture();
    const child = logger.child({ requestId: "r-1" }).child({ requestId: "r-2", runId: "a" });

    child.info("tool call", { tool: "search_web" });

    expect(lines[0]).toContain("requestId=r-2");
    expect(lines[0]).toContain("runId=a");
    expect(lines[0]).toContain("tool=search_web");
  });

  it("renders an error by its message and skips a field that is not there", () => {
    const { logger, lines } = capture();

    logger.error("the model did not answer", {
      cause: new Error("socket hang up"),
      retry: undefined,
    });

    expect(lines[0]).toContain('cause="socket hang up"');
    expect(lines[0]).not.toContain("retry");
  });

  it("clips a value long enough to be a document", () => {
    const { logger, lines } = capture();

    logger.debug("page read", { markdown: "word ".repeat(500) });

    expect(lines[0]?.length).toBeLessThan(600);
    expect(lines[0]).toContain("…");
  });

  it("takes the level and the format from the environment", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    vi.stubEnv("LOG_FORMAT", "json");

    const lines: string[] = [];
    const logger = createLogger({ write: (line) => lines.push(line) });

    logger.info("ignored");
    logger.warn("kept");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "").msg).toBe("kept");
  });

  it("says so when a level in the environment is a typo", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");

    const lines: string[] = [];
    const logger = createLogger({ write: (line) => lines.push(line) });

    logger.info("kept anyway");

    expect(lines[0]).toContain("LOG_LEVEL is not a level");
    expect(lines[1]).toContain("kept anyway");
  });
});

describe("silentLogger", () => {
  it("answers every method and children stay silent", () => {
    const logger: Logger = silentLogger.child({ requestId: "r-1" });

    expect(() => {
      logger.debug("a");
      logger.info("b");
      logger.warn("c");
      logger.error("d");
    }).not.toThrow();
  });
});
