import { assertEquals } from "@std/assert";
import { createLogger } from "./logger.ts";

/** Collect the JSON lines a logger emits, parsed back from text. */
function capture(level?: "debug" | "info" | "warn" | "error") {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  const logger = createLogger((line) => {
    raw.push(line);
    lines.push(JSON.parse(line));
  }, level);
  return { logger, lines, raw };
}

Deno.test("logger -- writes one JSON object per call, with a message", () => {
  const { logger, lines } = capture();

  logger.info({ node: "analyze" }, "node_start");

  assertEquals(lines.length, 1);
  assertEquals(lines[0].node, "analyze");
  assertEquals(lines[0].msg, "node_start");
  assertEquals(lines[0].level, 30);
  assertEquals(typeof lines[0].time, "number");
});

Deno.test("logger -- omits msg when there is none", () => {
  const { logger, lines } = capture();

  logger.info({ only: "fields" });

  assertEquals("msg" in lines[0], false);
});

Deno.test("logger -- serializes an Error field with message and stack", () => {
  const { logger, lines } = capture();

  logger.error({ err: new TypeError("bad input") }, "request");

  const err = lines[0].err as { name: string; message: string; stack: string };
  assertEquals(err.name, "TypeError");
  assertEquals(err.message, "bad input");
  assertEquals(typeof err.stack, "string");
});

Deno.test("logger -- leaves non-Error fields alone", () => {
  const { logger, lines } = capture();

  logger.info({ models: ["a/b", "c/d"], attempt: 2, ok: false });

  assertEquals(lines[0].models, ["a/b", "c/d"]);
  assertEquals(lines[0].attempt, 2);
  assertEquals(lines[0].ok, false);
});

Deno.test("logger -- drops lines below the configured level", () => {
  const { logger, lines } = capture("warn");

  logger.debug({}, "debug");
  logger.info({}, "info");
  logger.warn({}, "warn");
  logger.error({}, "error");

  assertEquals(
    lines.map((line) => line.msg),
    ["warn", "error"],
  );
});

Deno.test("logger -- at info, debug is dropped and info is kept", () => {
  const { logger, lines } = capture("info");

  logger.debug({}, "debug");
  logger.info({}, "info");

  assertEquals(
    lines.map((line) => line.msg),
    ["info"],
  );
});

Deno.test("logger -- at debug, every level is kept", () => {
  const { logger, lines } = capture("debug");

  logger.debug({}, "debug");
  logger.info({}, "info");
  logger.warn({}, "warn");
  logger.error({}, "error");

  assertEquals(
    lines.map((line) => line.msg),
    ["debug", "info", "warn", "error"],
  );
});

Deno.test("logger -- emits a single line per call", () => {
  const { logger, raw } = capture();

  logger.info({ text: "a\nb" }, "multi\nline");

  assertEquals(raw.length, 1);
  assertEquals(raw[0].includes("\n"), false);
});

// The OAuth callback logs its query params, and `code` is a Google
// authorization code that can be exchanged for tokens.
Deno.test("logger -- redacts credential query params", () => {
  const { logger, lines } = capture();

  logger.info(
    {
      query: { code: "4/abc", state: "xyz", v: "version-1" },
    },
    "request",
  );

  assertEquals(lines[0].query, {
    code: "[REDACTED]",
    state: "xyz",
    v: "version-1",
  });
});
