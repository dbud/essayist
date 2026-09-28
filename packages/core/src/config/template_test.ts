import { assertEquals } from "@std/assert";
import { extractVariables, renderTemplate } from "@/config/template.ts";

Deno.test("extractVariables -- returns unique names in order", () => {
  assertEquals(extractVariables("{{b}} {{a}} {{b}}"), ["b", "a"]);
});

Deno.test("extractVariables -- no variables is empty", () => {
  assertEquals(extractVariables("plain text"), []);
});

Deno.test("renderTemplate -- substitutes known variables", () => {
  assertEquals(
    renderTemplate("Hello {{name}}, {{topic}}!", {
      name: "Sam",
      topic: "essays",
    }),
    "Hello Sam, essays!",
  );
});

Deno.test("renderTemplate -- leaves unknown placeholders intact", () => {
  assertEquals(renderTemplate("Hi {{name}}", {}), "Hi {{name}}");
});

Deno.test("renderTemplate -- no variables is a no-op", () => {
  assertEquals(renderTemplate("plain text"), "plain text");
});
