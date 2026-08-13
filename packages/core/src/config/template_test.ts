import { assertEquals } from "@std/assert";
import { renderPrompt } from "./template.ts";

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
