import {
  InMemoryAdapter,
  summarizeFile,
  VirtualFileSystem,
} from "@essayist/core";
import { assertMatch } from "@std/assert";
import { createAgent, require } from "./utils.ts";

const agent = createAgent();

const adapter = new InMemoryAdapter();
const vfs = new VirtualFileSystem(adapter);

await vfs.write(
  "pangram.txt",
  "The quick brown fox jumps over the lazy dog. " +
    "This sentence contains every letter of the English alphabet. " +
    "Pangrams are often used to test typewriters and keyboards.",
);

Deno.test({
  name: "summarizeFile summarizes a file via tool call",
  ignore: !agent,
  fn: async () => {
    const summary = await summarizeFile("pangram.txt", require(agent), vfs);
    assertMatch(summary, /pangram|alphabet|letter/i);
  },
});
