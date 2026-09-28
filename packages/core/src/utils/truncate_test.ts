import { assertEquals } from "@std/assert";
import { byteLength, keepHead, keepTail } from "./truncate.ts";

// "a" is 1 byte, "é" is 2, "日" is 3, "😀" is 4.
const MIXED = "aé日😀";

Deno.test("byteLength -- UTF-8 byte size, not char count", () => {
  assertEquals(byteLength(""), 0);
  assertEquals(byteLength("abc"), 3);
  assertEquals(byteLength(MIXED), 10);
});

Deno.test("keepHead -- text that fits is returned untruncated", () => {
  assertEquals(keepHead(MIXED, byteLength(MIXED)), {
    text: MIXED,
    truncated: false,
  });
  assertEquals(keepHead(MIXED, 100), { text: MIXED, truncated: false });
});

Deno.test("keepHead -- ASCII cut at the budget", () => {
  assertEquals(keepHead("abcdef", 3), { text: "abc", truncated: true });
});

Deno.test("keepHead -- backs up to a leading byte, never splits a sequence", () => {
  // é needs 2 bytes; a budget of 2 only fits "a".
  assertEquals(keepHead(MIXED, 2), { text: "a", truncated: true });
  assertEquals(keepHead(MIXED, 3), { text: "aé", truncated: true });
  // 日 needs 3; a budget of 4 fits "aé" and nothing more.
  assertEquals(keepHead(MIXED, 4), { text: "aé", truncated: true });
  // A budget inside the 4-byte emoji keeps only "a".
  assertEquals(keepHead("a😀", 2), { text: "a", truncated: true });
  // Exact fit is not truncation.
  assertEquals(keepHead("a😀", 5), { text: "a😀", truncated: false });
  // One byte short backs up to the start of the emoji.
  assertEquals(keepHead("a😀", 4), { text: "a", truncated: true });
});

Deno.test("keepHead -- empty text or zero budget", () => {
  assertEquals(keepHead("", 10), { text: "", truncated: false });
  assertEquals(keepHead(MIXED, 0), { text: "", truncated: true });
});

Deno.test("keepTail -- ASCII cut at the budget", () => {
  assertEquals(keepTail("abcdef", 3), { text: "def", truncated: true });
});

Deno.test("keepTail -- advances to a leading byte, never splits a sequence", () => {
  // Budgets 2-3 fall inside the trailing 4-byte emoji; it is cut
  // entirely.
  assertEquals(keepTail(MIXED, 2), { text: "", truncated: true });
  assertEquals(keepTail(MIXED, 3), { text: "", truncated: true });
  // The last codepoint is 3 bytes and fits whole.
  assertEquals(keepTail("aé日", 3), { text: "日", truncated: true });
  // A budget of 3 cannot fit the 4-byte emoji.
  assertEquals(keepTail("a😀", 3), { text: "", truncated: true });
  assertEquals(keepTail("a😀", 4), { text: "😀", truncated: true });
});

Deno.test("keepTail -- empty text or zero budget", () => {
  assertEquals(keepTail("", 10), { text: "", truncated: false });
  assertEquals(keepTail(MIXED, 0), { text: "", truncated: true });
});
