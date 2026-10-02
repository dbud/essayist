import pino from "pino";

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key);
  }
  return undefined;
}

const isDevelopment = getEnv("DENO_ENV") === "development";
const level = getEnv("LOG_LEVEL") ?? (isDevelopment ? "debug" : "info");

export const logger = pino(
  {
    level,
    redact: {
      paths: ["query.code"],
      censor: "[REDACTED]",
    },
  },
  denoDestination(),
);

// pino's default destination buffers through SonicBoom and flushes on exit.
// Deno Deploy reclaims an isolate without running those handlers, so the
// buffer is lost and nothing reaches `deno deploy logs`. Writing synchronously
// to Deno.stdout makes each line visible the moment it is logged.
function denoDestination() {
  const encoder = new TextEncoder();
  return {
    write(chunk: string): boolean {
      try {
        Deno.stdout.writeSync(encoder.encode(chunk));
      } catch {
        // A closed or broken stdout must not take the caller down with it.
      }
      return true;
    },
  };
}
