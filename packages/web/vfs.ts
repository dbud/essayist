import { InMemoryAdapter, VirtualFileSystem } from "@essayist/core";

const adapter = new InMemoryAdapter();
export const vfs = new VirtualFileSystem(adapter);

const files: Record<string, string> = {
  "essay.txt": "The quick brown fox jumps over the lazy dog.\n" +
    "This sentence contains every letter of the alphabet.\n" +
    "It has been used as a typing test since the late 1800s.",
  "report.txt": "Q3 revenue grew 12% year-over-year.\n" +
    "Operating margins improved due to cost optimization.\n" +
    "Customer acquisition cost decreased by 8%.",
  "notes/ideas.md": "# Ideas\n\n" +
    "- Build a writing assistant\n" +
    "- Support markdown\n" +
    "- Version history",
  "notes/todo.md": "# TODO\n\n" +
    "[x] Set up project\n" +
    "[ ] Write tests\n" +
    "[ ] Deploy to production",
  "notes/archive/old-draft.txt": "This is an old draft.\n" +
    "It has been archived for safekeeping.",
  "notes/archive/outline.md": "# Outline\n\n" +
    "1. Introduction\n" +
    "2. Body\n" +
    "3. Conclusion",
  "src/main.ts": 'console.log("Hello, world!");',
  "src/utils.ts": "export function helper() {\n" +
    "  return true;\n" +
    "}",
};

for (const [path, content] of Object.entries(files)) {
  vfs.write(path, content);
}
