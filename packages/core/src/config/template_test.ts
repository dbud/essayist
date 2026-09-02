import { assertEquals } from "@std/assert";
import { extractVariables, renderPrompt } from "@/config/template.ts";

Deno.test("extractVariables -- returns unique names in order", () => {
  assertEquals(extractVariables("{{b}} {{a}} {{b}}"), ["b", "a"]);
});

Deno.test("extractVariables -- no variables is empty", () => {
  assertEquals(extractVariables("plain text"), []);
});

Deno.test("renderPrompt -- substitutes known variables", () => {
  assertEquals(
    renderPrompt("Hello {{name}}, {{topic}}!", {
      name: "Sam",
      topic: "essays",
    }),
    "Hello Sam, essays!",
  );
});

Deno.test("renderPrompt -- leaves unknown placeholders intact", () => {
  assertEquals(renderPrompt("Hi {{name}}", {}), "Hi {{name}}");
});

Deno.test("renderPrompt -- no variables is a no-op", () => {
  assertEquals(renderPrompt("plain text"), "plain text");
});
