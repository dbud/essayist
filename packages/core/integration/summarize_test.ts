import { summarizeFile } from "@essayist/core";
import { assertMatch } from "@std/assert";
import { createAgent } from "./utils.ts";

const agent = createAgent();

const files = new Map<string, string>([
  [
    "pangram.txt",
    "The quick brown fox jumps over the lazy dog. " +
    "This sentence contains every letter of the English alphabet. " +
    "Pangrams are often used to test typewriters and keyboards.",
  ],
]);

Deno.test("summarizeFile summarizes a file via tool call", async () => {
  const summary = await summarizeFile("pangram.txt", agent, files);
  assertMatch(summary, /pangram|alphabet|letter/i);
});
