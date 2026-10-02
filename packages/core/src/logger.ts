/** Structured JSON logger. Writes one JSON object per call to the console. */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

/** Receives a JSON line. Sync, so a reclaimed isolate cannot drop it. */
export type LogSink = (line: string) => void;

const LEVELS: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** Query params that carry a credential rather than data. */
const SECRET_PARAMS = new Set([
  "access_token",
  "code",
  "key",
  "secret",
  "token",
]);

function isLevel(value: string): value is LogLevel {
  return value in LEVELS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key);
  }
  return undefined;
}

/** Deno Deploy collects console output, not writes to the stdout fd. */
const consoleSink: LogSink = (line) => {
  console.log(line);
};

function redactParams(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = SECRET_PARAMS.has(key) ? "[REDACTED]" : value;
  }
  return out;
}

/** JSON.stringify renders an Error as `{}`, losing the message and stack. */
function normalize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "query" && isRecord(value)) {
      out[key] = redactParams(value);
    } else if (value instanceof Error) {
      out[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createLogger(sink: LogSink, level: LogLevel = "info") {
  const min = LEVELS[level];
  const write = (at: LogLevel, fields: LogFields, msg?: string) => {
    if (LEVELS[at] < min) return;
    sink(
      JSON.stringify({
        level: LEVELS[at],
        time: Date.now(),
        ...normalize(fields),
        ...(msg !== undefined && { msg }),
      }),
    );
  };
  return {
    debug: (fields: LogFields, msg?: string) => write("debug", fields, msg),
    info: (fields: LogFields, msg?: string) => write("info", fields, msg),
    warn: (fields: LogFields, msg?: string) => write("warn", fields, msg),
    error: (fields: LogFields, msg?: string) => write("error", fields, msg),
  };
}

export type Logger = ReturnType<typeof createLogger>;

const configured =
  getEnv("LOG_LEVEL") ??
  (getEnv("DENO_ENV") === "development" ? "debug" : "info");

export const logger: Logger = createLogger(
  consoleSink,
  isLevel(configured) ? configured : "info",
);
