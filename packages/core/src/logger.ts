import type pino from "pino";

let _logger: Promise<pino.Logger> | undefined;

export function logger(): Promise<pino.Logger> {
  return _logger ??= import("pino").then((mod) => {
    const pinoFactory = mod.default;
    const isProduction = Deno.env.get("DENO_ENV") === "production";
    return isProduction
      ? pinoFactory({ level: Deno.env.get("LOG_LEVEL") ?? "info" })
      : pinoFactory({
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
  });
}
