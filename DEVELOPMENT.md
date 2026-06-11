# Development Guide

This file provides guidance for AI agents and contributors working on this
project. **Read it first** when starting a new thread. Update it when you
discover new information, change structure, or add packages. Prefer keeping this
file current over leaving stale notes elsewhere.

## What This Is

Essayist is a Deno monorepo that wraps the OpenRouter API to build AI-powered
writing tools. The core library provides an `Agent` class that calls LLMs via
OpenRouter, a virtual file system with versioning and annotation support, and a
set of file-manipulation tools the LLM can invoke. A Fresh web app exposes a
chat interface backed by these tools, a file browser, and a file viewer with
markdown rendering.

## Monorepo Structure

Deno workspace with two packages:

- `packages/core/` — `@essayist/core`, shared library code
- `packages/web/` — `@essayist/web`, Fresh web app

### Repository Tree

```
essayist/
├── deno.jsonc              # Workspace root (members: web, core, core/integration)
├── deno.lock               # Lockfile
├── .gitignore
├── .github/workflows/
│   └── deno.yml            # CI: fmt, lint, test
├── DEVELOPMENT.md          # ← You are here
├── vendor/                 # Vendored npm dependencies
├── node_modules/           # npm compatibility layer
│
├── packages/
│   ├── core/               # @essayist/core — shared library
│   │   ├── deno.json       # Package config, exports, tasks
│   │   ├── mod.ts          # Public API
│   │   ├── src/
│   │   │   ├── agent.ts         # Agent class — OpenRouter client wrapper
│   │   │   ├── agent_logger.ts  # logAgentCall(), logAgentResult() — stream logging
│   │   │   ├── capital.ts       # getCapital() + capitalResponseSchema
│   │   │   ├── capital_test.ts  # Unit tests for getCapital
│   │   │   ├── logger.ts        # Lazy pino logger (env-safe import)
│   │   │   ├── schema.ts        # Zod→JSON-schema instruction generator + example builder
│   │   │   ├── schema_test.ts
│   │   │   ├── summarize.ts     # summarizeFile() — file summarizer via tool calls
│   │   │   ├── summarize_test.ts
│   │   │   ├── tools/
│   │   │   │   ├── index.ts         # ToolPrompt interface + re-exports
│   │   │   │   ├── read_file.ts     # createReadFileTool()
│   │   │   │   ├── read_file_test.ts
│   │   │   │   ├── list_files.ts    # createListFilesTool()
│   │   │   │   ├── list_files_test.ts
│   │   │   │   ├── grep.ts          # createGrepTool()
│   │   │   │   ├── grep_test.ts
│   │   │   │   ├── write_file.ts    # createWriteFileTool()
│   │   │   │   ├── write_file_test.ts
│   │   │   │   └── testing/
│   │   │   │       └── mock_vfs.ts  # createMockVFS() helper for tool tests
│   │   │   └── vfs/
│   │   │       ├── types.ts         # VFS interface + all result types
│   │   │       ├── vfs.ts           # VirtualFileSystem (partial VFS impl)
│   │   │       ├── vfs_test.ts      # Tests for read, write, list, grep, versioning
│   │   │       ├── persistence.ts   # PersistenceAdapter interface + InMemoryAdapter
│   │   │       └── persistence_test.ts
│   │   └── integration/    # @essayist/core/integration — live API tests
│   │       ├── deno.json
│   │       ├── agent_test.ts       # Hits real OpenRouter API (getCapital)
│   │       ├── summarize_test.ts   # Hits real OpenRouter API (summarizeFile)
│   │       ├── tools_test.ts       # Integration tests for list_files, grep, write_file
│   │       └── utils.ts            # Reads OPENROUTER_API_KEY from env
│   │
│   └── web/                # @essayist/web — Fresh web app
│       ├── deno.jsonc      # Package config, tasks, compiler options
│       ├── main.ts         # App entry: wires middleware + fsRoutes
│       ├── client.ts       # Imports global CSS (required by Fresh)
│       ├── define.ts       # State type + createDefine helper
│       ├── signals.ts      # Global persistent signals (selectedFile, openedFiles, etc.)
│       ├── vfs.ts          # Server-side VFS instance seeded with sample files
│       ├── vite.config.ts  # Vite + Fresh + Tailwind + core watcher plugin
│       ├── _fresh/         # Generated Fresh build output (gitignored)
│       ├── assets/
│       │   └── styles.css  # Tailwind import + custom "essayist" daisyUI theme
│       ├── components/
│       │   ├── FontSelect.tsx      # Font family toggle (serif/sans/mono) for file viewer
│       │   ├── MarkdownView.tsx    # Renders markdown HTML (via marked + DOMPurify)
│       │   ├── Toolbar.tsx         # Generic toolbar shell (accepts children)
│       │   └── ViewModeSelect.tsx  # View mode toggle (auto/markdown/plain) for file viewer
│       ├── hooks/
│       │   ├── useChat.ts          # useChat() hook — SSE chat for Preact islands
│       │   └── useFiles.ts         # useFiles() + useFileContent() — file API hooks
│       ├── islands/
│       │   ├── Chat.tsx            # Interactive Preact island (streaming chat UI)
│       │   ├── ClearCache.tsx      # Button to clear localStorage + reload
│       │   ├── FileBrowser.tsx     # File tree sidebar (fetches from /api/files)
│       │   ├── FileViewer.tsx      # File content viewer (markdown or plain text)
│       │   ├── Section.tsx         # Collapsible sidebar section (details/summary)
│       │   └── Tabs.tsx            # Open file tabs with close buttons
│       ├── middleware/
│       │   └── agent.ts    # Creates Agent from OPENROUTER_API_KEY, attaches to state
│       ├── routes/
│       │   ├── _app.tsx    # HTML shell (navbar, h-dvh body, theme)
│       │   ├── index.tsx   # Home page — three-column layout (browser, viewer, sidebar)
│       │   └── api/
│       │       ├── chat.ts         # GET /api/chat?message=… → SSE stream
│       │       └── files/
│       │           ├── index.ts    # GET /api/files → file list
│       │           └── [path].ts   # GET /api/files/:path → file content
│       ├── utils/
│       │   ├── fileTree.ts     # buildFileTree() — converts flat file list to tree
│       │   ├── markdown.ts     # renderMarkdown() — marked + DOMPurify
│       │   ├── persistentSignal.ts  # persistentSignal() + usePersistentSignal()
│       │   ├── sanitize.ts     # sanitizeHtml() — DOMPurify wrapper
│       │   └── sse.ts          # SSE streaming helpers (parseSSE, streamModelResultSSE)
│       └── static/
│           └── favicon.ico
```

### Key Packages

| Package                      | Path                         | Purpose                                                                                  |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `@essayist/core`             | `packages/core/`             | Shared library: `Agent`, `getCapital`, `summarizeFile`, VFS, tools, Zod schema utilities |
| `@essayist/core/integration` | `packages/core/integration/` | Live API tests (require `OPENROUTER_API_KEY`)                                            |
| `@essayist/web`              | `packages/web/`              | Fresh 2.x web app (Preact + Tailwind CSS + daisyUI) deployed to Deno Deploy              |

### Important Entry Points

- **`packages/web/main.ts`** — Web app boot. Creates `App`, attaches
  `agentMiddleware`, calls `fsRoutes()`.
- **`packages/core/mod.ts`** — Core library public API. Exports `getCapital`,
  `summarizeFile`, `Agent`, tool factories (`createReadFileTool`,
  `createListFilesTool`, `createGrepTool`, `createWriteFileTool`),
  `VirtualFileSystem`, and `InMemoryAdapter`.
- **`packages/web/routes/api/chat.ts`** — SSE streaming chat endpoint. Creates
  an in-memory VFS seeded with sample files, wires up `read_file` tool, and uses
  `Agent.callModelWithTools` to stream responses.
- **`packages/web/routes/api/files/index.ts`** — GET `/api/files`. Lists all
  files from the server-side VFS.
- **`packages/web/routes/api/files/[path].ts`** — GET `/api/files/:path`. Reads
  a single file from the VFS.
- **`packages/web/islands/Chat.tsx`** — Interactive Preact island that consumes
  the SSE stream via `useChat`. Renders chat bubbles, tool calls, reasoning, and
  a message input form.
- **`packages/web/islands/FileViewer.tsx`** — File content viewer island.
  Fetches file content from `/api/files/:path`, renders as markdown or plain text
  based on view mode. Includes `FontSelect` and `ViewModeSelect` in a `Toolbar`.
- **`packages/web/islands/FileBrowser.tsx`** — File tree sidebar island.
  Fetches file list from `/api/files`, renders a collapsible tree with folders
  and files.
- **`packages/web/islands/Tabs.tsx`** — Open file tabs with close buttons.
  Uses `openedFiles` and `selectedFile` signals.
- **`packages/web/islands/Section.tsx`** — Collapsible sidebar section using
  `<details>`/`<summary>` with daisyUI `collapse` styling.
- **`packages/web/middleware/agent.ts`** — Middleware. Instantiates `Agent` with
  `OPENROUTER_API_KEY` and attaches it to `ctx.state.agent`.
- **`packages/web/signals.ts`** — Global persistent signals:
  `selectedFile`, `openedFiles`, `fileHistory`, `viewerFont`, `viewMode`.
  Also exports `openFile()` and `closeFile()` helpers.
- **`packages/web/vfs.ts`** — Server-side VFS instance seeded with sample files
  (essay.txt, report.txt, notes/ideas.md, markdown-showcase.md, etc.).
- **`packages/web/utils/persistentSignal.ts`** — `persistentSignal()` (global
  singleton signals synced to localStorage) and `usePersistentSignal()` (hook
  version for island components).
- **`packages/web/utils/useChat.ts`** and **`packages/web/utils/sse.ts`** —
  Helper utilities for managing the SSE connection and client-side state.

### Key Dependencies

- **OpenRouter** — `@openrouter/agent` (v^0.7.0) for `callModel`, `tool()`,
  `stepCountIs`, and the `OpenRouter` client class. Also `@openrouter/sdk`
  (v^0.12.79) as a transitive dependency.
- **Zod** (v4) — Schema validation, JSON Schema generation, and metadata for
  structured LLM output.
- **Fresh** (v2.3.3) — Web framework (file-system routing, islands architecture,
  middleware).
- **Preact** (v10.29.1) — UI library (JSX precompiled, not client-side rendered
  except islands).
- **@preact/signals** (v2.9.0) — Reactive signals for Preact islands (used by
  `Chat`, `FileViewer`, `FileBrowser`, `Tabs`, and `useChat`).
- **Tailwind CSS** (v4.1.10) — Styling via `@tailwindcss/vite` plugin.
- **daisyUI** (v5.5.20) — Component library built on Tailwind. Custom "essayist"
  theme defined in `assets/styles.css`.
- **Vite** (v7.1.3) — Dev server and build tool (via `@fresh/plugin-vite`).
- **pino** (v9.6.0) — JSON logging library. Pretty-printed in dev, JSON in
  production.
- **marked** — Markdown parsing for `MarkdownView` component.
- **DOMPurify** — HTML sanitization for rendered markdown.
- **lucide-preact** — Icon library (FileText, Folder, FolderOpen, X, Zap, etc.).

## Commands

### Formatting

```
deno fmt
deno fmt --check .
```

### Linting

```
deno lint
```

### Type Checking

```
deno check
```

### Testing

```
deno test -A
deno test -A --watch
```

### Integration Tests

Integration tests in `packages/core/integration/` use the real OpenRouter API.
Requires `OPENROUTER_API_KEY` in a `.env` file at the project root:

```
deno task -f core test:integration
```

Without the key the tests skip gracefully.

### Web Development

```
deno task -f web dev
```

Production builds and serving are handled by Deno Deploy.

## Pre-commit Checklist

1. `deno fmt`
2. `deno lint`
3. `deno check`
4. `deno test -A`

## Conventions and Patterns

- **Deno workspace** — `deno.jsonc` defines workspace members. Each package has
  its own `deno.json` (or `deno.jsonc` for web) with scoped imports (`@/` maps
  to `./src/` in core).
- **Fresh file-system routing** — Routes live in `routes/`, API routes in
  `routes/api/`. Islands (interactive Preact components) live in `islands/`.
- **State management** — `createDefine` pattern from Fresh: `define.ts` exports a
  typed `define` helper; middleware populates `ctx.state.agent`. Client-side
  state uses `@preact/signals` via `persistentSignal()` (global) and
  `usePersistentSignal()` (per-island hook), both synced to localStorage.
- **Three-column layout** — The home page (`routes/index.tsx`) uses a horizontal
  flex layout: file browser (`w-64`), file viewer (`flex-1`), and right sidebar
  (`flex-1 max-w-lg`). The body uses `h-dvh` to constrain to the viewport.
  The right sidebar wraps a `join join-vertical` group of collapsible sections
  in a scrollable container (`overflow-y-auto min-h-0`).
- **File viewer layout** — `FileViewer` uses a flex column with `h-full`
  constrained by the route wrapper's `min-h-0`. The toolbar and content area
  use `flex-1 min-h-0` with `overflow-y-auto` so the content scrolls within
  remaining space. A spacer div at the bottom allows scrolling past the end.
- **View mode** — `viewMode` signal (`auto`, `markdown`, `plain`) controls
  whether file content is rendered as markdown or plain text. Auto mode uses
  the file extension (`.md` → markdown).
- **Font selection** — `viewerFont` signal (`font-serif`, `font-sans`,
  `font-mono`) controls the font family applied to file content.
- **Structured LLM output** — `Agent.callModel(input, schema)` sends a Zod
  schema-derived instruction prompt with an example JSON object, expects JSON
  back, parses it with `stripMarkdownFences`, and validates with Zod. The schema
  is passed by the caller (e.g. `capital.ts` owns `capitalResponseSchema`).
- **Schema instructions** —
  `generateInstructions(schema, { includeExample: true })` produces a field
  listing from the Zod schema's JSON Schema representation. Example values are
  sourced from `.meta({ example: value })` on individual fields via
  `z.globalRegistry`.
- **Tool calling** — `Agent.callModelWithTools(input, toolPrompts)` passes tools
  to the SDK's `callModel`, which handles the full tool loop (send definitions,
  execute calls, feed results back). Tools are defined with `tool()` from
  `@openrouter/agent` and wrapped in a `ToolPrompt` (tool + instruction string).
- **Tool factories** — Each tool has a `createXxxTool(vfs)` factory in
  `packages/core/src/tools/`. Tools delegate to the `VFS` interface for all file
  operations. A `createMockVFS(overrides?)` helper in
  `tools/testing/mock_vfs.ts` provides stub implementations for unit testing.
- **Virtual File System** — `VirtualFileSystem` implements the `VFS` interface
  backed by a `PersistenceAdapter`. `InMemoryAdapter` is the default in-memory
  store. The VFS supports read, write, list, grep (with directory prefix
  matching), versioning (snapshot on overwrite, revert, history), diff (Myers
  algorithm), and text-span marks with fuzzy anchoring.
- **Agent logging** — `callModelWithTools` feeds the result to
  `logAgentResult()` which reads the items stream and logs completed tool calls,
  outputs, messages, and reasoning separately. Uses a lazy pino logger that
  defers `import("pino")` to avoid env access at module load time.
- **Vite watches core** — `vite.config.ts` includes a custom `watchCore` plugin
  that adds `packages/core/` to Vite's file watcher so changes to core trigger
  web app reloads.
- **Vendored dependencies** — `deno.jsonc` has `"vendor": true`; npm packages
  are vendored locally.
- **Integration tests** — Live API tests are in a separate workspace member
  (`packages/core/integration/`) with their own `deno.json` and `.env` file.
  They skip gracefully without an API key.
- **CI** — `.github/workflows/deno.yml` runs `deno fmt --check`, `deno lint`,
  and `deno test -A` on push and PRs to `main`.
- **Commit messages** — Follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. Use imperative mood, capitalize first letter, no
  trailing period. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore`, `revert`.

## Known Gotchas

- **`OPENROUTER_API_KEY` required** — Both the web app and integration tests
  need this env var. The web middleware returns 500 if it's missing; integration
  tests print a warning and exit 0.
- **`client.ts`** — Imports global CSS (`styles.css`) for client-side rendering.
  It is required by Fresh to inject the stylesheet into the generated HTML, even
  though it isn't imported directly in other modules.
- **Models are hardcoded** — `Agent` uses a fixed list of models:
  `["openai/gpt-oss-120b:free", "openrouter/owl-alpha"]`. This is not
  configurable via constructor or env var.
- **Fresh build output** — `_fresh/` is gitignored. Production builds are
  handled by Deno Deploy (`deno deploy` org: `dbud`, app: `essayist`).
- **JSX runtime** — `jsx: "react-jsx"` with `jsxImportSource: "preact"` uses the
  automatic JSX runtime. This is required for `@prefresh/vite` HMR to work in
  dev. Do **not** use `jsx: "precompile"` — it transforms JSX before Vite sees
  the code, breaking client-side hot reload for islands. Only island components
  hydrate on the client.
- **Lazy logger** — `logger.ts` uses a dynamic `import("pino")` to avoid pino's
  top-level `process.env` access, which crashes without `--allow-env`. The
  `logger()` function returns `Promise<pino.Logger>` — consumers must `await`
  it. This means importing `@essayist/core` no longer crashes in env-restricted
  contexts.
- **Flex scroll containers** — For `overflow-y-auto` to work in a flex child, every
  ancestor in the chain needs `min-h-0` to allow shrinking below content size.
  The pattern is: `h-dvh` on body → `flex-1 min-h-0` on the route wrapper →
  `h-full min-h-0` on the component → `flex-1 min-h-0 overflow-y-auto` on the
  scroll container. Missing `min-h-0` at any level causes the content to expand
  past the viewport instead of scrolling.
- **`join` layout and scroll** — daisyUI's `join` class uses `inline-flex` which
  doesn't support `overflow`. To make a scrollable sidebar with `join` styling,
  wrap the `join` group in a separate scrollable container div rather than
  applying `overflow` directly to the `join` parent.
- **Persistent signals** — `persistentSignal()` creates global singleton signals
  shared across the app. `usePersistentSignal()` is a hook that creates per-island
  signals synced to localStorage. Use the global version for app-wide state
  (selectedFile, openedFiles) and the hook version for island-local state
  (chat messages, file content).
