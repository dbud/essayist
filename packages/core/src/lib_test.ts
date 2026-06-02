import { assertEquals } from "jsr:@std/assert@^1";
import { add } from "./lib.ts";

Deno.test("add returns the sum of two numbers", () => {
  assertEquals(add(2, 3), 5);
});

Deno.test("add handles negative numbers", () => {
  assertEquals(add(-1, 1), 0);
});

Deno.test("add handles zero", () => {
  assertEquals(add(0, 0), 0);
});
