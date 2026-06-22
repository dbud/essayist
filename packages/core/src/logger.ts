import pino from "pino";

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key);
  }
  return undefined;
}

const isDevelopment = getEnv("DENO_ENV") === "development";
const level = getEnv("LOG_LEVEL") ?? (isDevelopment ? "debug" : "info");

const instance = isDevelopment
  ? pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    })
  : pino({ level });

export function logger(): pino.Logger {
  return instance;
}
