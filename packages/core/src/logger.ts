import pino from "pino";

const isProduction = Deno.env.get("DENO_ENV") === "production";

export const logger = isProduction
  ? pino({
    level: Deno.env.get("LOG_LEVEL") ?? "info",
  })
  : pino({
    level: Deno.env.get("LOG_LEVEL") ?? "debug",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  });
