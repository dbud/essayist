import pino from "pino";

const isDevelopment = Deno.env.get("DENO_ENV") === "development";
const level = Deno.env.get("LOG_LEVEL") ?? (isDevelopment ? "debug" : "info");

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
