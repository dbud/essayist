import { assertEquals } from "@std/assert";
import { test } from "vitest";
import { extractVariables, renderTemplate } from "#/config/template.ts";

test("extractVariables -- returns unique names in order", () => {
  assertEquals(extractVariables("{{b}} {{a}} {{b}}"), ["b", "a"]);
});

test("extractVariables -- no variables is empty", () => {
  assertEquals(extractVariables("plain text"), []);
});

test("renderTemplate -- substitutes known variables", () => {
  assertEquals(
    renderTemplate("Hello {{name}}, {{topic}}!", {
      name: "Sam",
      topic: "essays",
    }),
    "Hello Sam, essays!",
  );
});

test("renderTemplate -- leaves unknown placeholders intact", () => {
  assertEquals(renderTemplate("Hi {{name}}", {}), "Hi {{name}}");
});

test("renderTemplate -- no variables is a no-op", () => {
  assertEquals(renderTemplate("plain text"), "plain text");
});
