import { assertEquals } from "@std/assert";
import { test } from "vitest";
import { bulletList, joinBlocks, joinLines, listOf } from "./markdown.ts";

test("joinBlocks -- drops empty blocks and flattens one level", () => {
  assertEquals(
    joinBlocks("a", "", undefined, false, ["b", "c"], [], "d"),
    "a\n\nb\n\nc\n\nd",
  );
});

test("joinBlocks -- undelivered conditionals produce no blocks", () => {
  assertEquals(joinBlocks("a", true && "b", false && "c"), "a\n\nb");
});

test("joinLines -- keeps blank separator lines", () => {
  assertEquals(
    joinLines("a", "", "b", undefined, false, ["c", "d"]),
    "a\n\nb\nc\nd",
  );
});

test("bulletList -- one bullet per item", () => {
  assertEquals(bulletList(["one", "two"]), "- one\n- two");
});

test("listOf -- bulleted items under the header, undefined when empty", () => {
  assertEquals(
    listOf("Strengths:", ["one", "two"]),
    "## Strengths:\n\n- one\n- two",
  );
  assertEquals(listOf("Strengths:", []), undefined);
});

test("listOf -- numbered items", () => {
  assertEquals(
    listOf("Claims, in order:", ["a", "b"], { numbered: true }),
    "## Claims, in order:\n\n1. a\n2. b",
  );
});
