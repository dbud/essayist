import {
  createGrepTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
  InMemoryAdapter,
  VirtualFileSystem,
} from "@essayist/core";
import { assertEquals, assertMatch } from "@std/assert";
import { createAgent } from "./utils.ts";

const agent = createAgent();

async function createVFS(
  files?: Map<string, string>,
): Promise<VirtualFileSystem> {
  const adapter = new InMemoryAdapter();
  const vfs = new VirtualFileSystem(adapter);
  if (files) {
    for (const [path, content] of files) {
      await vfs.write(path, content);
    }
  }
  return vfs;
}

// list_files

const listFilesVFS = await createVFS(
  new Map([
    [
      "notes/ideas.md",
      "- Build a CLI tool\n- Write integration tests\n- Add grep support",
    ],
    [
      "notes/todo.md",
      "- Fix bug in parser\n- Update documentation\n- Review PRs",
    ],
    [
      "essay.txt",
      "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet. " +
      "Pangrams are often used to test typewriters and keyboards. " +
      "They have been popular since the late 1800s.",
    ],
  ]),
);

Deno.test({
  name: "integration: list_files -- model discovers files",
  ignore: !agent,
  fn: async () => {
    const toolPrompt = createListFilesTool(listFilesVFS);
    const result = agent!.callModelWithTools(
      "What files are available? List all of them.",
      [toolPrompt],
    );
    const text = await result.getText();

    assertMatch(text, /notes\/ideas\.md/);
    assertMatch(text, /notes\/todo\.md/);
    assertMatch(text, /essay\.txt/);
  },
});

// grep

const grepVFS = await createVFS(
  new Map([
    [
      "notes/ideas.md",
      "- Build a CLI tool\n- Write integration tests\n- Add grep support\n- Refactor the parser module\n- Improve test coverage",
    ],
    [
      "notes/todo.md",
      "- Fix bug in parser\n- Update documentation\n- Review PRs\n- Write unit tests for grep\n- Deploy to production",
    ],
    [
      "essay.txt",
      "The quick brown fox jumps over the lazy dog. " +
      "This sentence contains every letter of the alphabet. " +
      "Pangrams are often used to test typewriters and keyboards. " +
      "They have been popular since the late 1800s. " +
      "The fox was quick, the dog was lazy, and the sentence was perfect.",
    ],
    [
      "report.md",
      "Q3 revenue grew 12% year-over-year. " +
      "Operating margins improved due to cost optimization. " +
      "The parser module was refactored for better performance. " +
      "Customer satisfaction scores reached an all-time high. " +
      "We plan to expand into new markets next quarter. " +
      "The total budget is $5.00 for this project.",
    ],
  ]),
);

Deno.test({
  name: "integration: grep -- model searches for pattern across files",
  ignore: !agent,
  fn: async () => {
    const toolPrompt = createGrepTool(grepVFS);
    const result = agent!.callModelWithTools(
      "Search for all mentions of 'parser' across all files. Tell me which files contain it and the matching lines.",
      [toolPrompt],
    );
    const text = await result.getText();

    assertMatch(text, /parser/);
    assertMatch(text, /notes\/ideas\.md|notes\/todo\.md|report\.md/);
  },
});

Deno.test({
  name: "integration: grep -- model searches literal text with special chars",
  ignore: !agent,
  fn: async () => {
    const toolPrompt = createGrepTool(grepVFS);
    const result = agent!.callModelWithTools(
      "Search for the exact text '$5.00' across all files. Use grep.",
      [toolPrompt],
    );
    const text = await result.getText();
    assertMatch(text, /5\.00/);
  },
});

Deno.test({
  name: "integration: grep -- model searches with regex",
  ignore: !agent,
  fn: async () => {
    const toolPrompt = createGrepTool(grepVFS);
    const result = agent!.callModelWithTools(
      "Find all lines that start with '- ' (list items) in the notes directory. Use a regex pattern.",
      [toolPrompt],
    );
    const text = await result.getText();

    assertMatch(text, /notes\/ideas\.md/);
    assertMatch(text, /notes\/todo\.md/);
    assertMatch(text, /Build a CLI tool/);
    assertMatch(text, /Write integration tests/);
    assertMatch(text, /Add grep support/);
    assertMatch(text, /Refactor the parser module/);
    assertMatch(text, /Improve test coverage/);
    assertMatch(text, /Fix bug in parser/);
    assertMatch(text, /Update documentation/);
    assertMatch(text, /Review PRs/);
    assertMatch(text, /Write unit tests for grep/);
    assertMatch(text, /Deploy to production/);
  },
});

// write_file

Deno.test({
  name: "integration: write_file -- model creates a file",
  ignore: !agent,
  fn: async () => {
    const vfs = await createVFS();
    const toolPrompt = createWriteFileTool(vfs);
    const result = agent!.callModelWithTools(
      "Create a file called 'hello.txt' with the content 'Hello, world!'",
      [toolPrompt],
    );
    await result.getText();

    const file = await vfs.read("hello.txt");
    assertEquals(file.content, "Hello, world!");
    assertEquals(file.lines, 1);
  },
});

Deno.test({
  name: "integration: write_file -- model overwrites a file",
  ignore: !agent,
  fn: async () => {
    const vfs = await createVFS(
      new Map([["config.json", '{"version": "1.0"}']]),
    );
    const toolPrompt = createWriteFileTool(vfs);
    const result = agent!.callModelWithTools(
      'Overwrite config.json with: {"version": "2.0"}',
      [toolPrompt],
    );
    await result.getText();

    const file = await vfs.read("config.json");
    assertMatch(file.content, /"version": "2.0"/);
  },
});

// read_file + write_file

const readWriteVFS = await createVFS(
  new Map([
    [
      "input.txt",
      "elderberry\nbanana\ngrape\napple\nfig\ndate\ncherry",
    ],
  ]),
);

Deno.test({
  name: "integration: read_file + write_file -- model reads then transforms",
  ignore: !agent,
  fn: async () => {
    const readTool = createReadFileTool(readWriteVFS);
    const writeTool = createWriteFileTool(readWriteVFS);
    const result = agent!.callModelWithTools(
      "Read input.txt, sort the lines alphabetically, and write the sorted output to sorted.txt",
      [readTool, writeTool],
    );
    await result.getText();

    const file = await readWriteVFS.read("sorted.txt");
    const lines = file.content.split("\n");
    assertEquals(lines, [
      "apple",
      "banana",
      "cherry",
      "date",
      "elderberry",
      "fig",
      "grape",
    ]);
  },
});
