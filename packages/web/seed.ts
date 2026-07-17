import type {
  PersistenceAdapter,
  User,
  Workspace,
  WorkspaceStore,
} from "@essayist/core";
import { VirtualFileSystem } from "@essayist/core";

const files: Record<string, string> = {
  "essay.txt": `The quick brown fox jumps over the lazy dog.
This sentence contains every letter of the alphabet.
It has been used as a typing test since **the** late 1800s.`,
  "report.txt": `Q3 revenue grew 12% year-over-year.
Operating margins improved due to cost optimization.
Customer acquisition cost decreased by 8%.`,
  "notes/ideas.md": `# Ideas

- Build a writing assistant
- Support markdown
- Version history`,
  "notes/todo.md": `# TODO

[x] Set up project
[ ] Write tests
[ ] Deploy to production`,
  "notes/archive/old-draft.txt": `This is an old draft.
It has been archived for safekeeping.`,
  "notes/archive/outline.md": `# Outline

1. Introduction
2. Body
3. Conclusion`,
  "src/main.ts": 'console.log("Hello, world!");',
  "src/utils.ts": `export function helper() {
  return true;
}`,
  "markdown-showcase.md": `# Markdown Showcase

This file demonstrates the markdown rendering capabilities.

## Longer Content

### The Art of Writing

Writing is a form of art that has been practiced for thousands of years, evolving from ancient cave paintings and cuneiform tablets to the digital documents we create today. At its core, writing is about communication -- the transfer of ideas, emotions, and knowledge from one mind to another across time and space. The best writing makes the reader feel something, whether it's the thrill of a suspenseful narrative, the clarity of a well-explained concept, or the comfort of a familiar voice.

Good writing doesn't happen by accident. It requires careful thought about structure, word choice, rhythm, and purpose. Every sentence should serve a function, every paragraph should build upon the last, and every section should guide the reader toward a deeper understanding of the subject at hand. As the famous author William Zinsser once wrote, "Writing is thinking on paper." The act of putting words into sentences and paragraphs forces clarity of thought that mere contemplation cannot achieve.

### On Software Craftsmanship

Building software is remarkably similar to writing. Both activities require the creator to balance structure with creativity, precision with expressiveness, and simplicity with completeness. A well-crafted codebase tells a story -- it has a beginning (the entry point), a middle (the core logic), and an end (the output or response). Just as a rambling essay loses its reader, a tangled codebase loses its maintainers.

The best software engineers, like the best writers, revise relentlessly. They refactor for clarity, rename for precision, and delete for simplicity. They understand that code is read far more often than it is written, and they optimize accordingly. Comments serve as annotations, function names act as chapter headings, and module boundaries provide the structural paragraphs that organize complex systems into comprehensible wholes.

### A Note on Markdown

Markdown was designed to be as readable as possible in its raw form. The syntax is minimal by intention -- it provides just enough structure to convey meaning without overwhelming the writer with formatting concerns. Headings use hash marks, emphasis uses asterisks, and lists use simple dashes or numbers. This simplicity is why Markdown has become the de facto standard for documentation, README files, blog posts, and even entire books.

What makes Markdown particularly powerful is its portability. A Markdown file can be rendered as HTML, converted to PDF, transformed into a presentation, or displayed directly in a web browser with minimal tooling. The plain-text format ensures that your content is never locked into a proprietary system, and the human-readable syntax means you'll never need special software to edit your files.

## Text Formatting

**Bold text**, *italic text*, ~~strikethrough~~, and \`inline code\`.

## Links

[Deno](https://deno.land) -- the secure runtime for JavaScript and TypeScript.

## Lists

### Unordered

- Item one
- Item two
  - Nested item
  - Another nested item
- Item three

### Ordered

1. First step
2. Second step
3. Third step

### Task List

- [x] Set up the project
- [x] Add markdown rendering
- [ ] Write more tests
- [ ] Deploy to production

## Blockquotes

> The best way to predict the future is to invent it.
> -- Alan Kay

## Code Blocks

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Tables

| Feature       | Status | Notes               |
|---------------|--------|---------------------|
| Markdown      | Done   | Using marked        |
| Code blocks   | Done   | Syntax highlighting |
| Tables        | Done   | GFM support         |

## Horizontal Rule

---

## More Headings

### Level 3

#### Level 4

##### Level 5

###### Level 6

That's all folks!`,
};

/** Seed the demo workspace with sample files and a few marks. */
export async function seedDemoFiles(vfs: VirtualFileSystem): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await vfs.write(path, content);
  }

  await vfs.mark(
    "essay.txt",
    "The quick brown fox jumps over the lazy dog.",
    "Classic pangram -- every letter of the alphabet.",
  );
  await vfs.mark(
    "essay.txt",
    "since **the** late",
    "Historical context would strengthen this claim.",
  );
  await vfs.mark(
    "notes/ideas.md",
    "Build a writing assistant",
    "Core product idea -- prioritize this.",
  );
}

/** Sentinel key marking that the demo seed has already been applied. */
const SEED_SENTINEL = ["__seeded", "demo"] as const;

export interface DemoData {
  demoUser: User;
  demoUser2: User;
  demoWorkspace: Workspace;
}

/**
 * Idempotently seed demo users, a demo workspace, and sample files for local
 * development. If the sentinel key is already set (a previous boot seeded), the
 * existing demo entities are loaded and returned without re-creating, so demo
 * IDs stay stable across restarts.
 *
 * Reset by wiping the store (`deno task kv:wipe`) or deleting the local SQLite
 * file; the next boot re-seeds from scratch.
 */
export async function seedDemo(
  store: WorkspaceStore,
  adapter: PersistenceAdapter,
): Promise<DemoData> {
  const seeded = (await adapter.get<boolean>(SEED_SENTINEL))?.value;
  if (seeded) {
    return loadDemo(store);
  }

  const demoUser = await store.createUser({
    email: "demo@example.com",
    name: "Demo User",
  });
  const demoUser2 = await store.createUser({
    email: "demo2@example.com",
    name: "Demo User 2",
  });
  const demoWorkspace = await store.createWorkspace("Demo", demoUser.id);

  await seedDemoFiles(new VirtualFileSystem(adapter, demoWorkspace.id));

  await adapter.batch([{ type: "set", key: SEED_SENTINEL, value: true }]);
  return { demoUser, demoUser2, demoWorkspace };
}

/** Load the previously-seeded demo entities (sentinel already set). */
async function loadDemo(store: WorkspaceStore): Promise<DemoData> {
  const demoUser = await store.getUserByEmail("demo@example.com");
  const demoUser2 = await store.getUserByEmail("demo2@example.com");
  if (!demoUser || !demoUser2) {
    throw new Error(
      "Seed sentinel is set but demo users are missing; run `deno task kv:wipe` and restart.",
    );
  }
  const workspaces = await store.listWorkspacesForUser(demoUser.id);
  const demoWorkspace = workspaces.find((w) => w.name === "Demo");
  if (!demoWorkspace) {
    throw new Error(
      "Seed sentinel is set but the demo workspace is missing; run `deno task kv:wipe` and restart.",
    );
  }
  return { demoUser, demoUser2, demoWorkspace };
}
