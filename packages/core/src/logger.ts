import type pino from "pino";

let _logger: Promise<pino.Logger> | undefined;

export function logger(): Promise<pino.Logger> {
  return _logger ??= import("pino").then(async (mod) => {
    const pinoFactory = mod.default;
    const isProduction = Deno.env.get("DENO_ENV") === "production";
    const level = Deno.env.get("LOG_LEVEL") ??
      (isProduction ? "info" : "debug");

    if (isProduction) {
      return pinoFactory({ level });
    }

    try {
      await import("pino-pretty");
      return pinoFactory({
        level,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      });
    } catch {
      return pinoFactory({ level });
    }
  });
}
