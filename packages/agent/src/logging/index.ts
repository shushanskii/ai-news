/**
 * The one place this package writes to the process.
 *
 * A research run is long, spends most of its time inside somebody else's service, and answers with
 * a single JSON — which makes it very easy to watch fail and impossible to say why. So every step
 * reports itself, and the caller decides where that goes: `main.ts` hands in a logger writing to
 * stderr, a test hands in `silentLogger`, and a request-scoped `child` is what ties the twenty lines
 * of one run together.
 *
 * Deliberately not a dependency: the interface is six methods, and the alternative would put a
 * logging framework between this package and every consumer that only wanted `runResearch`.
 */

/** Severity of a line. `silent` is not a severity but a switch, and lives in `LoggerOptions`. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** How a line is rendered: readable in a terminal, or one JSON object per line for a collector. */
export type LogFormat = "text" | "json";

/** Structured context attached to a line. Values are rendered, never stringified by the caller. */
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /**
   * A logger that carries these fields on every line it writes.
   *
   * This is how a run id reaches a node three calls deep without any of them taking a parameter for
   * it: the caller binds it once, at the edge.
   */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  /** Lines below this level are dropped. Defaults to `LOG_LEVEL`, then to `info`. */
  readonly level?: LogLevel | "silent";
  /** Defaults to `LOG_FORMAT`, then to `text`. */
  readonly format?: LogFormat;
  /**
   * Where a line goes. Defaults to stderr: stdout belongs to whatever the process was asked to
   * produce, and a log line mixed into it corrupts the answer.
   */
  readonly write?: (line: string) => void;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Longest rendered value. A page of markdown is not a log field; its length is. */
const MAX_VALUE = 400;

/**
 * A logger that writes nothing.
 *
 * The default for every node factory, so a unit test of a node does not have to hand in a logger it
 * will only assert nothing about — and so a node that logs is never the reason a test prints noise.
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

/**
 * A logger writing lines to a stream.
 *
 * Levels and format come from the environment unless the caller says otherwise, because the operator
 * raising a level on a running box is the person this exists for.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? levelFrom(process.env.LOG_LEVEL);
  const format = options.format ?? formatFrom(process.env.LOG_FORMAT);
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));

  const logger = build(level, format, write, {});

  if (options.level === undefined && process.env.LOG_LEVEL !== undefined) {
    const known = [...Object.keys(RANK), "silent"];

    if (!known.includes(process.env.LOG_LEVEL.trim())) {
      logger.warn("LOG_LEVEL is not a level, using info", {
        value: process.env.LOG_LEVEL,
        known,
      });
    }
  }

  if (options.format === undefined && process.env.LOG_FORMAT !== undefined) {
    if (process.env.LOG_FORMAT.trim() !== "json" && process.env.LOG_FORMAT.trim() !== "text") {
      logger.warn("LOG_FORMAT is not a format, using text", {
        value: process.env.LOG_FORMAT,
        known: ["text", "json"],
      });
    }
  }

  return logger;
}

function build(
  level: LogLevel | "silent",
  format: LogFormat,
  write: (line: string) => void,
  bound: LogFields,
): Logger {
  const threshold = level === "silent" ? Number.POSITIVE_INFINITY : RANK[level];

  function emit(severity: LogLevel, message: string, fields?: LogFields): void {
    if (RANK[severity] < threshold) {
      return;
    }

    const at = new Date().toISOString();
    const all = { ...bound, ...fields };

    write(
      format === "json"
        ? renderJson(at, severity, message, all)
        : renderText(at, severity, message, all),
    );
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) => build(level, format, write, { ...bound, ...fields }),
  };
}

function renderText(at: string, level: LogLevel, message: string, fields: LogFields): string {
  const parts = [at, level.toUpperCase().padEnd(5), message];

  for (const [key, value] of Object.entries(fields)) {
    const rendered = renderValue(value);

    if (rendered !== undefined) {
      parts.push(`${key}=${quote(rendered)}`);
    }
  }

  return parts.join(" ");
}

function renderJson(at: string, level: LogLevel, message: string, fields: LogFields): string {
  const line: Record<string, unknown> = { ts: at, level, msg: message };

  for (const [key, value] of Object.entries(fields)) {
    const rendered = jsonValue(value);

    // A field may not overwrite the envelope: a run that logs its own `level` would hide the level.
    if (rendered !== undefined && !(key in line)) {
      line[key] = rendered;
    }
  }

  return JSON.stringify(line);
}

/**
 * A number in a JSON log is a number, not `"96940"`.
 *
 * The text format has to flatten everything; a collector does not, and a duration that arrives as a
 * string cannot be averaged, sorted or alerted on without every query rewriting it first.
 */
function jsonValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return clip(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  // Anything structured goes as one clipped string: a log line stays one line, and a field that
  // needs to be queried belongs in fields of its own.
  return clip(JSON.stringify(value));
}

function renderValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return clip(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return clip(JSON.stringify(value));
}

function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();

  return flat.length <= MAX_VALUE ? flat : `${flat.slice(0, MAX_VALUE)}…`;
}

function quote(rendered: string): string {
  return rendered === "" || /\s/.test(rendered) ? `"${rendered}"` : rendered;
}

function levelFrom(value: string | undefined): LogLevel | "silent" {
  const name = value?.trim().toLowerCase();

  return name === "debug" ||
    name === "info" ||
    name === "warn" ||
    name === "error" ||
    name === "silent"
    ? name
    : "info";
}

function formatFrom(value: string | undefined): LogFormat {
  return value?.trim().toLowerCase() === "json" ? "json" : "text";
}
