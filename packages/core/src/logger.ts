import pino from "pino";

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key);
  }
  return undefined;
}

const isDevelopment = getEnv("DENO_ENV") === "development";
const level = getEnv("LOG_LEVEL") ?? (isDevelopment ? "debug" : "info");

export const logger = pino({ level });
