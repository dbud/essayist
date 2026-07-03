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
markdown rendering. The app also includes a Lexical-based rich text editor.

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
├── biome.json              # Biome formatter/linter config
├── .github/workflows/
│   └── deno.yml            # CI: fmt:check, lint, test
├── .husky/
│   └── pre-commit          # Runs deno lint + biome check on staged files, then fmt:check
├── .zed/
│   └── settings.json       # Zed editor config (Deno LSP + Biome)
├── DEVELOPMENT.md          # ← You are here
├── node_modules/           # npm compatibility layer
│
└── packages/
    ├── core/               # @essayist/core — shared library
    │   ├── deno.json       # Package config, exports, tasks
    │   ├── mod.ts          # Public API
    │   ├── src/
    │   │   ├── agent.ts         # Agent class — OpenRouter client wrapper
    │   │   ├── agent_logger.ts  # logAgentCall(), logAgentResult() — stream logging
    │   │   ├── logger.ts        # Lazy pino logger (env-safe import)
    │   │   ├── schema.ts        # Zod→JSON-schema instruction generator + example builder
    │   │   ├── schema_test.ts
    │   │   ├── summarize.ts     # summarizeFile() — file summarizer via tool calls
    │   │   ├── summarize_test.ts
    │   │   ├── tools/
    │   │   │   ├── index.ts         # ToolPrompt interface + re-exports
    │   │   │   ├── read_file.ts     # createReadFileTool()
    │   │   │   ├── read_file_test.ts
    │   │   │   ├── list_files.ts    # createListFilesTool()
    │   │   │   ├── list_files_test.ts
    │   │   │   ├── grep.ts          # createGrepTool()
    │   │   │   ├── grep_test.ts
    │   │   │   ├── write_file.ts    # createWriteFileTool()
    │   │   │   ├── write_file_test.ts
    │   │   │   ├── mark.ts           # createMarkTool()
    │   │   │   └── mark_test.ts
    │   │   │   └── testing/
    │   │   │       └── mock_vfs.ts  # createMockVFS() helper for tool tests
    │   │   └── vfs/
    │   │       ├── types.ts         # VFS interface + all result types
    │   │       ├── vfs.ts           # VirtualFileSystem (full VFS impl)
    │   │       ├── vfs_test.ts      # Tests for read, write, list, grep, versioning
    │   │       ├── vfs_marks_test.ts # Tests for mark, getMarks, deleteMark, migration
    │   │       ├── persistence.ts   # PersistenceAdapter interface + InMemoryAdapter
    │   │       ├── persistence_test.ts
    │   │       ├── diff.ts          # Per-word diff
    │   │       ├── diff_test.ts
    │   │       ├── unified_diff.ts  # unifiedDiff() — unified diff formatter
    │   │       ├── unified_diff_test.ts
    │   │       ├── fuzzy.ts         # Fuzzy text matching for mark anchoring
    │   │       ├── fuzzy_test.ts
    │   │       ├── levenshtein.ts   # Levenshtein distance for fuzzy matching
    │   │       ├── levenshtein_test.ts
    │   │       ├── marks_resolver.ts   # Mark migration across versions + fuzzy find
    │   │       ├── marks_resolver_test.ts
    │   │       └── testing/
    │   │           └── helpers.ts       # createVFS(), createFile() test helpers
    │   └── integration/    # @essayist/core/integration — live API tests
    │       ├── deno.json
    │       ├── summarize_test.ts   # Hits real OpenRouter API (summarizeFile)
    │       ├── tools_test.ts       # Integration tests for list_files, grep, write_file
    │       └── utils.ts            # Reads OPENROUTER_API_KEY from env
    │
    └── web/                # @essayist/web — Fresh web app
        ├── deno.jsonc      # Package config, tasks, compiler options
        ├── main.ts         # App entry: wires middleware + fsRoutes
        ├── client.ts       # Imports global CSS (required by Fresh)
        ├── define.ts       # State type + createDefine helper
        ├── signals.ts      # activeEditor signal (Lexical editor instance)
        ├── vfs.ts          # Server-side VFS instance seeded with sample files
        ├── vite.config.ts  # Vite + Fresh + Tailwind + core watcher plugin
        ├── _fresh/         # Generated Fresh build output (gitignored)
        ├── assets/
        │   └── styles.css  # Tailwind import + custom "essayist" daisyUI theme
        ├── components/
        │   ├── BlockTypeSelect.tsx  # Block-type dropdown (icons per option) using Dropdown
        │   ├── Dropdown.tsx         # Reusable dropdown shell (open/outside-click/close)
        │   ├── EditorToolbar.tsx    # Bold/italic/strike/code toggles + block-type select
        │   ├── FontSelect.tsx       # Font family dropdown (Serif/Sans/Mono) using Dropdown
        │   ├── MarkdownView.tsx    # Renders markdown HTML (via marked + DOMPurify)
        │   ├── Tabs.tsx           # Generic scrollable tab strip with overflow buttons
        │   ├── Toolbar.tsx         # Generic toolbar shell (accepts children)
        │   ├── ToolbarButton.tsx   # Presentational toggle button for EditorToolbar
        │   └── ViewModeSelect.tsx  # View mode toggle (auto/markdown/plain) for file viewer
        ├── editor/
        │   ├── blockFormat.ts        # $getBlockType() + $setBlocksType() for the toolbar
        │   ├── blockFormat_test.ts   # Tests for block type detection/conversion
        │   ├── extension.ts         # createEditorExtension(path) + bootstrapEditorExtension
        │   ├── markExtension.ts     # MarksExtension — applies mark ranges to the editor
        │   ├── selection.ts         # $createSelection(), $saveSelection(), $restoreSelection()
        │   ├── textNodeSpans.ts     # buildTextNodeSpans(), findPosition(), findRange(), $collectTextNodeSpans()
        │   ├── textNodeSpans_test.ts  # Tests for markdown offset ↔ TextNode mapping
        │   ├── marksAtCursorExtension.ts # MarksAtCursorExtension — marks at the caret
        │   └── toolbarStateExtension.ts # ToolbarStateExtension — selection-driven toolbar state
        ├── hooks/
        │   └── useChat.ts          # useChat() hook — SSE chat for Preact islands
        ├── islands/
        │   ├── Chat.tsx            # Interactive Preact island (streaming chat UI)
        │   ├── ClearCache.tsx      # Button to clear localStorage + reload
        │   ├── ErrorBoundary.tsx   # Preact error boundary with reset button
        │   ├── ExportPreviewSection.tsx  # Export preview with mark highlighting + whitespace viz
        │   ├── FileBrowser.tsx     # File tree sidebar (fetches from /api/files)
        │   ├── FileViewer.tsx      # File content viewer (markdown or plain text)
        │   ├── LexicalTreeViewSection.tsx  # Debug panel showing active Lexical editor state
        │   ├── MarkRangesSection.tsx  # Debug panel showing resolved mark ranges as JSON
        │   ├── MarksSection.tsx    # Displays marks for the selected file, grouped by thread
        │   ├── Section.tsx         # Collapsible sidebar section (details/summary)
        │   ├── FileViewerTabs.tsx # Open file tabs (close buttons) using Tabs
        │   └── editor/
        │       ├── ActiveEditorRef.tsx  # EditorRefPlugin wrapper that sets/clears activeEditor
        │       └── Editor.tsx           # Lexical rich text editor island component
        ├── middleware/
        │   └── agent.ts    # Creates Agent from OPENROUTER_API_KEY, attaches to state
        ├── routes/
        │   ├── _app.tsx    # HTML shell (navbar, h-dvh body, theme)
        │   ├── index.tsx   # Home page — three-column layout (browser, viewer, sidebar)
        │   └── api/
        │       ├── chat.ts         # GET /api/chat?message=… → SSE stream
        │       └── files/
        │           ├── index.ts    # GET /api/files → file list
        │           └── [path]/
        │               ├── index.ts  # GET /api/files/:path → file content
        │               └── marks.ts  # GET /api/files/:path/marks → file marks (with resolve status)
        ├── signals/
        │   ├── file.ts            # FileModel — per-file content, loading, dirty, editor state
        │   ├── fileTree.ts        # FileTreeModel + useFiles() + buildFileTree()
        │   ├── marks.ts           # MarksModel — per-file marks with reload support
        │   ├── openedFiles.ts     # OpenedFilesModel — selectedFile, openedFiles, fileHistory
        │   ├── preferences.ts     # viewerFont, viewMode persistent signals
        │   └── toolbar.ts         # toolbarState — selection-driven toolbar state
        ├── utils/
        │   ├── asyncState.ts            # createAsyncState() — loading/error state helper
        │   ├── markdown.ts              # renderMarkdown(), markdownToEditorState(), editorStateToMarkdown()
        │   ├── persistentSignal.ts      # persistentSignal() + usePersistentSignal()
        │   ├── sanitize.ts              # sanitizeHtml() — DOMPurify wrapper
        │   └── sse.ts                   # SSE streaming helpers (parseSSE, streamModelResultSSE)
        └── static/
            └── favicon.ico
```

### Key Packages

| Package                      | Path                         | Purpose                                                                                    |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `@essayist/core`             | `packages/core/`             | Shared library: `Agent`, `summarizeFile`, VFS, tools, `resolveMarks`, Zod schema utilities |
| `@essayist/core/integration` | `packages/core/integration/` | Live API tests (require `OPENROUTER_API_KEY`)                                              |
| `@essayist/web`              | `packages/web/`              | Fresh 2.x web app (Preact + Tailwind CSS + daisyUI) deployed to Deno Deploy                |

### Important Entry Points

- **`packages/web/main.ts`** — Web app boot. Creates `App`, attaches
  `agentMiddleware`, calls `fsRoutes()`.
- **`packages/core/mod.ts`** — Core library public API. Exports `summarizeFile`,
  `Agent`, tool factories (`createReadFileTool`, `createListFilesTool`,
  `createGrepTool`, `createWriteFileTool`, `createMarkTool`), `resolveMarks`
  (mark migration resolver), `VirtualFileSystem`, `InMemoryAdapter`, and VFS
  types (`DiffResult`, `FileEntry`, `FileSnapshot`, `FileVersion`,
  `GrepOptions`, `GrepResult`, `Mark`, `MarkOptions`, `MarkResult`,
  `MarkStatus`, `ReadOptions`, `WriteResult`).
- **`packages/web/routes/api/chat.ts`** — SSE streaming chat endpoint. Uses the
  server-side VFS seeded with sample files, wires up read, list, grep, and write
  tools, and uses `Agent.callModelWithTools` to stream responses.
- **`packages/web/routes/api/files/index.ts`** — GET `/api/files`. Lists all
  files from the server-side VFS.
- **`packages/web/routes/api/files/[path].ts`** — GET `/api/files/:path`. Reads
  a single file from the VFS.
- **`packages/web/islands/Chat.tsx`** — Interactive Preact island that consumes
  the SSE stream via `useChat`. Renders chat bubbles, tool calls, reasoning, and
  a message input form.
- **`packages/web/islands/FileViewer.tsx`** — File content viewer island.
  Fetches file content from `/api/files/:path`, renders as markdown or plain
  text based on view mode. Includes `FontSelect` and `ViewModeSelect` in a
  `Toolbar`.
- **`packages/web/islands/FileBrowser.tsx`** — File tree sidebar island. Fetches
  file list from `/api/files`, renders a collapsible tree with folders and
  files. Uses `FileTreeModel` from `signals/fileTree.ts`.
- **`packages/web/components/Tabs.tsx`** — Generic horizontal tab strip: hides
  the native scrollbar, shows ◀/▶ only on overflow (disabled when the direction
  isn't available), and keeps the active tab scrolled into view.
- **`packages/web/islands/FileViewerTabs.tsx`** — Open file tabs with close
  buttons, rendered via `Tabs`. Uses `openedFiles` and `selectedFile` signals
  from `signals/openedFiles.ts`.
- **`packages/web/islands/Section.tsx`** — Collapsible sidebar section using
  `<details>`/`<summary>` with daisyUI `collapse` styling.
- **`packages/web/islands/ErrorBoundary.tsx`** — Preact error boundary island
  using `useErrorBoundary`. Renders error message with a "Try again" reset
  button.
- **`packages/web/islands/LexicalTreeViewSection.tsx`** — Debug panel that
  displays the active Lexical editor's JSON state. Renders inside a collapsible
  `Section` titled "Lexical Editor".
- **`packages/web/islands/MarksSection.tsx`** — Displays marks for the currently
  selected file. Reads from `useMarks(path)` (reactive signal), groups by
  `thread_id`, and renders each group as a daisyUI card. Each mark shows: label,
  status badge (resolved/stale), selected text, comment, offset, and length.
  Includes its own `Section` wrapper titled "Marks". Returns `null` when no file
  is selected, loading, or no marks exist.
- **`packages/web/islands/MarkRangesSection.tsx`** — Debug panel that displays
  the resolved mark ranges (`ranges` signal from `useMarks`) as JSON inside a
  collapsible `Section` titled "Mark Regions". Shows the output of
  `resolveMarksForEditor()` which maps VFS marks to Lexical `NodeRange`
  positions.
- **`packages/web/islands/ExportPreviewSection.tsx`** — Export preview panel
  that renders the file's markdown content with active (non-stale) marks
  highlighted in yellow. Visualizes whitespace (spaces as `·`, tabs as `→`,
  newlines as `¬`). Lists stale marks separately below the preview. Uses
  `useFile(path).markdown` and `useMarks(path).resolved` signals.
- **`packages/web/islands/editor/ActiveEditorRef.tsx`** — Wraps
  `EditorRefPlugin` and a `useEffect` cleanup into a single component. Sets
  `activeEditor.value` on mount and clears it on unmount, preventing stale
  editor references after the island is removed from the DOM.
- **`packages/web/islands/editor/Editor.tsx`** — Lexical rich text editor
  component. Builds a per-file extension via `createEditorExtension(path)`
  (binding `MarksExtension` to the editor's own `path`) and spreads in
  `$initialEditorState` per render. Uses `@lexical/react` runtime plugins.
- **`packages/web/islands/editor/extension.ts`** — `createEditorExtension(path)`
  builds the runtime editor extension with dependencies: `RichTextExtension`,
  `HistoryExtension`, `AutoFocusExtension`, `LinkExtension`, `ListExtension`,
  `CodeExtension`, `HorizontalRuleExtension`, and
  `configExtension(MarksExtension,
  { path })`. `bootstrapEditorExtension` is
  the path-less variant used by the headless `markdownToEditorState()`.
- **`packages/web/middleware/agent.ts`** — Middleware. Instantiates `Agent` with
  `OPENROUTER_API_KEY` and attaches it to `ctx.state.agent`.
- **`packages/web/signals.ts`** — Exports the `activeEditor` signal
  (`LexicalEditor | null`), used by `LexicalTreeViewSection`.
- **`packages/web/signals/openedFiles.ts`** — `OpenedFilesModel` with
  `selectedFile`, `openedFiles`, `fileHistory` persistent signals and `open()`/
  `close()` helpers. Instantiated as the global `openedFiles` singleton.
- **`packages/web/signals/fileTree.ts`** — `FileTreeModel` with file list
  loading, error state, and `buildFileTree()` tree builder. Exports `useFiles()`
  hook and `TreeNode` interface.
- **`packages/web/signals/file.ts`** — `FileModel` with per-file content,
  loading, error, dirty tracking, Lexical editor state (`initialState`,
  `modifiedState`, `state`), and a `markdown` computed signal (editor state →
  markdown string via `editorStateToMarkdown()`). Also provides `isSelected`
  computed and `setModifiedState()` for editor updates. Exports `useFile(path)`
  helper.
- **`packages/web/signals/marks.ts`** — `MarksModel` with per-file marks,
  loading, error, `reload()`, and two computed signals: `resolved` (marks
  migrated from original content to current markdown via core's
  `resolveMarks()`) and `ranges` (marks mapped to Lexical `NodeRange` positions
  via `resolveMarksForEditor()`). Also has an `effect` that applies mark ranges
  to the active Lexical editor via `$wrapSelectionInMarkNode`. Exports
  `useMarks(path)` helper and `MarkWithRange` interface. Follows the same
  `createModel` + `Map` cache pattern as `fileTree.ts`. Also exports
  `marksAtCursor`, a global signal holding the set of mark `thread_id`s at the
  caret, written by `MarksAtCursorExtension`.
- **`packages/web/signals/preferences.ts`** — `viewerFont` and `viewMode`
  persistent signals.
- **`packages/web/components/EditorToolbar.tsx`** — Toolbar for the active
  editor: bold/italic/strikethrough/inline-code toggle buttons plus a block-type
  `<select>` (normal, heading 1-3, quote, code block, bullet/numbered list).
  Reads `activeEditor` (to dispatch commands) and `toolbarState` (for active
  state). Inline formats use `FORMAT_TEXT_COMMAND`; lists use Lexical's list
  commands; block conversions use `$setBlocksType` (`editor/blockFormat.ts`).
  Inline buttons are disabled inside a code block.
- **`packages/web/editor/marksAtCursorExtension.ts`** — `MarksAtCursorExtension`,
  registered in `afterRegistration`, writes the set of mark `thread_id`s at the
  selection anchor into the `marksAtCursor` signal on every update / selection
  change. Walks the anchor's ancestor chain collecting `MarkNode` ids (handles
  nested/overlapping marks).
- **`packages/web/editor/toolbarStateExtension.ts`** — `ToolbarStateExtension`,
  registered in `afterRegistration`, writes the selection-derived toolbar state
  (block type, inline format flags, `inCodeBlock`) into the `toolbarState`
  signal on every update / selection change. Runs from `afterRegistration` so
  the first read sees the committed initial state.
- **`packages/web/vfs.ts`** — Server-side VFS instance seeded with sample files
  (essay.txt, report.txt, notes/ideas.md, notes/todo.md, notes/archive/,
  src/main.ts, src/utils.ts, markdown-showcase.md).
- **`packages/web/utils/persistentSignal.ts`** — `persistentSignal()` (global
  singleton signals synced to localStorage) and `usePersistentSignal()` (hook
  version for island components).
- **`packages/web/utils/asyncState.ts`** — `createAsyncState()` helper that
  returns a `run(task)` function plus `loading` and `error` signals. Used by
  `FileModel` and `FileTreeModel`.
- **`packages/web/hooks/useChat.ts`** and **`packages/web/utils/sse.ts`** —
  Helper utilities for managing the SSE connection and client-side state.
- **`packages/web/utils/markdown.ts`** — `renderMarkdown()` (marked +
  DOMPurify), `markdownToEditorState()` (markdown → Lexical `EditorState`), and
  `editorStateToMarkdown()` (Lexical `EditorState` → markdown string via
  `$convertToMarkdownString`). Both conversion functions use the shared
  `bootstrapEditorExtension`.
- **`packages/web/editor/selection.ts`** — `$createSelection()`,
  `$saveSelection()`, and `$restoreSelection()`: build a Lexical
  `RangeSelection` from a `NodeRange`, and save/restore a selection across
  mutations that reshuffle TextNodes (using absolute markdown offsets).
- **`packages/web/editor/textNodeSpans.ts`** — Offset mapping utilities for
  converting content character offsets to Lexical TextNode positions.
  `buildTextNodeSpans()` walks all TextNodes in document order, finds each one's
  text in the exported content string, and builds a sorted list of
  `TextNodeSpan` entries (each with `key`, `text`, `offset`). `findPosition()`
  uses binary search to convert a content offset to a `NodePosition` (TextNode
  key + local offset). `findRange()` converts a content offset+length to a
  `NodeRange` (anchor + focus). Offsets in syntax gaps snap to the nearest valid
  text position. `$collectTextNodeSpans()` walks the active tree (in-flight
  state during an update).
- **`packages/web/editor/textNodeSpans_test.ts`** — Tests covering simple
  paragraphs, headings, bold text, two-paragraph documents, mixed content
  (headings, lists, blockquotes, code blocks), and edge cases for
  `findPosition()`.

### Key Dependencies

- **OpenRouter** — `@openrouter/agent` (v^0.7.1) for `callModel`, `tool()`,
  `stepCountIs`, and the `OpenRouter` client class. Also `@openrouter/sdk`
  (v^0.12.79) as a transitive dependency.
- **Zod** (v4) — Schema validation, JSON Schema generation, and metadata for
  structured LLM output.
- **Fresh** (v2.3.3) — Web framework (file-system routing, islands architecture,
  middleware).
- **Preact** (v10.29.1) — UI library (JSX precompiled, not client-side rendered
  except islands).
- **@preact/signals** (v2.9.0) — Reactive signals for Preact islands (used by
  `Chat`, `FileViewer`, `FileBrowser`, `Tabs`, and `useChat`). Also provides
  `createModel()` for stateful model patterns (`FileModel`, `FileTreeModel`,
  `OpenedFilesModel`).
- **Tailwind CSS** (v4.1.10) — Styling via `@tailwindcss/vite` plugin.
- **@tailwindcss/typography** (v0.5.16) — Typography plugin for prose styling.
- **daisyUI** (v5.5.20) — Component library built on Tailwind. Custom "essayist"
  theme defined in `assets/styles.css`.
- **Vite** (v7.1.3) — Dev server and build tool (via `@fresh/plugin-vite`).
- **pino** (v10.3.1) — JSON logging library. Pretty-printed in dev, JSON in
  production.
- **marked** (v17.0.3) — Markdown parsing for `MarkdownView` component.
- **DOMPurify** (v3.4.9) — HTML sanitization for rendered markdown.
- **Lexical** (v0.45.0) — Rich text editor framework. Used via `lexical`,
  `@lexical/react`, `@lexical/rich-text`, `@lexical/history`, `@lexical/link`,
  `@lexical/list`, `@lexical/code`, `@lexical/extension`, `@lexical/markdown`
  (for markdown ↔ editor state conversion), and `@lexical/mark` (for `MarkNode`
  / `$wrapSelectionInMarkNode`).
- **lucide-preact** (v1.17.0) — Icon library (FileText, Folder, FolderOpen, X,
  Zap, etc.).
- **@fontsource-variable/hanken-grotesk** — Sans-serif variable font.
- **@fontsource-variable/recursive** — Mono variable font.
- **@fontsource-variable/source-serif-4** — Serif variable font.
- **@biomejs/biome** (v2.5.0) — Formatter and linter (replaces deno fmt/lint for
  code formatting; Biome handles JS/TS/JSON/CSS, Deno handles .ts fmt via
  `deno fmt`).

## Commands

### Formatting

Biome is the primary formatter for JS/TS/JSON/CSS files:

```
deno task fmt          # Format all files (Biome write)
deno task fmt:check    # Check formatting (Biome check)
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
deno task -f web dev        # Dev server with pino-pretty logging
deno task -f web build      # Production build (vite build → _fresh/)
```

Production builds and serving are handled by Deno Deploy.

### Per-package Check

Each package has a `check` task that runs fmt, lint, and type check:

```
deno task -f core check
deno task -f web check
```

## Pre-commit Checklist

1. `deno task fmt:check`
2. `deno lint`
3. `deno check`
4. `deno test -A`

The `.husky/pre-commit` hook runs `deno lint` and `biome check` on staged files,
then `deno task fmt:check` before each commit.

## Conventions and Patterns

- **Deno workspace** — `deno.jsonc` defines workspace members. Each package has
  its own `deno.json` (or `deno.jsonc` for web) with scoped imports (`@/` maps
  to `./src/` in core, `./` in web).
- **Fresh file-system routing** — Routes live in `routes/`, API routes in
  `routes/api/`. Islands (interactive Preact components) live in `islands/`.
- **State management** — `createDefine` pattern from Fresh: `define.ts` exports
  a typed `define` helper; middleware populates `ctx.state.agent`. Client-side
  state uses `@preact/signals` via `persistentSignal()` (global) and
  `usePersistentSignal()` (per-island hook), both synced to localStorage.
  Stateful models use `createModel()` from `@preact/signals` (`FileModel`,
  `FileTreeModel`, `OpenedFilesModel`).
- **Three-column layout** — The home page (`routes/index.tsx`) uses a horizontal
  flex layout: file browser (`w-64`), file viewer (`flex-1`), and right sidebar
  (`flex-1 max-w-lg`). The body uses `h-dvh` to constrain to the viewport. The
  right sidebar wraps a `join join-vertical` group of collapsible sections in a
  scrollable container (`overflow-y-auto min-h-0`).
- **File viewer layout** — `FileViewer` uses a flex column with `h-full`
  constrained by the route wrapper's `min-h-0`. The toolbar and content area use
  `flex-1 min-h-0` with `overflow-y-auto` so the content scrolls within
  remaining space. A spacer div at the bottom allows scrolling past the end.
- **View mode** — `viewMode` signal (`auto`, `markdown`, `plain`) controls
  whether file content is rendered as markdown or plain text. Auto mode uses the
  file extension (`.md` → markdown).
- **Font selection** — `viewerFont` signal (`font-serif`, `font-sans`,
  `font-mono`) controls the font family applied to file content. Three variable
  font families are loaded via `@fontsource-variable/*` packages.
- **Structured LLM output** — `Agent.callModel(input, schema)` sends a Zod
  schema-derived instruction prompt with an example JSON object, expects JSON
  back, parses it with `stripMarkdownFences`, and validates with Zod.
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
  The `createMarkTool(vfs)` factory creates a tool for annotating text spans
  with comments. It accepts `path`, `selected_text`, `comment`, and optional
  `label`, `line_hint`, `thread_id`, and `context_radius` params. `line_hint` is
  a 1-based line number from the numbered read output, used to disambiguate
  duplicate text occurrences.
- **Virtual File System** — `VirtualFileSystem` implements the `VFS` interface
  backed by a `PersistenceAdapter`. `InMemoryAdapter` is the default in-memory
  store. The VFS supports read (with line-range and numbering options), write,
  list (with directory prefix filtering), grep (regex), search (literal text),
  versioning (history, revert), and unified diff between versions. Marks are
  text-span annotations bound to specific versions, with automatic migration
  across versions via diff-based offset mapping and fuzzy matching
  (`marks_resolver.ts`). `mark()` accepts an optional `MarkOptions` bag
  (`label`, `lineHint`, `threadId`, `contextRadius`). `lineHint` is a 1-based
  line number that is internally converted to a character offset via a
  `lineToOffset()` helper before disambiguating duplicate occurrences.
  `deleteMark(path, versionId, markId)` removes a mark by ID from a specific
  version. Marks are stored per-version as `Mark[]` under a single key
  `marks:{path}:{versionId}`.
- **Mark resolution** — `resolveMarks({ marks, oldContent, newContent })` from
  core migrates marks across content changes using diff-based offset mapping and
  fuzzy matching. Returns marks with updated offsets and a `status`
  (`"resolved"` or `"stale"`). The web app uses this in `MarksModel.resolved` to
  track which marks still apply after editing.
- **Agent logging** — `callModelWithTools` feeds the request to `logAgentCall()`
  and the result to `logAgentResult()`, which reads the items stream and logs
  completed tool calls, outputs, messages, and reasoning separately. Uses a lazy
  pino logger that defers `import("pino")` to avoid env access at module load
  time.
- **Vite watches core** — `vite.config.ts` includes a custom `watchCore` plugin
  that adds `packages/core/` to Vite's file watcher so changes to core trigger
  web app reloads.
- **Integration tests** — Live API tests are in a separate workspace member
  (`packages/core/integration/`) with their own `deno.json` and `.env` file.
  They skip gracefully without an API key.
- **CI** — `.github/workflows/deno.yml` runs `deno task fmt:check`, `deno lint`,
  and `deno test -A` on push and PRs to `main`.
- **Commit messages** — Follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. Use imperative mood, capitalize first letter, no
  trailing period. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore`, `revert`.
- **Editor** — Zed is configured in `.zed/settings.json` to use Deno LSP and
  Biome for JS/TS/JSON/CSS files. Biome handles formatting and linting; Deno
  handles type checking.

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
- **Flex scroll containers** — For `overflow-y-auto` to work in a flex child,
  every ancestor in the chain needs `min-h-0` to allow shrinking below content
  size. The pattern is: `h-dvh` on body → `flex-1 min-h-0` on the route wrapper
  → `h-full min-h-0` on the component → `flex-1 min-h-0 overflow-y-auto` on the
  scroll container. Missing `min-h-0` at any level causes the content to expand
  past the viewport instead of scrolling.
- **`join` layout and scroll** — daisyUI's `join` class uses `inline-flex` which
  doesn't support `overflow`. To make a scrollable sidebar with `join` styling,
  wrap the `join` group in a separate scrollable container div rather than
  applying `overflow` directly to the `join` parent.
- **Persistent signals** — `persistentSignal()` creates global singleton signals
  shared across the app. `usePersistentSignal()` is a hook that creates
  per-island signals synced to localStorage. Use the global version for app-wide
  state (selectedFile, openedFiles) and the hook version for island-local state
  (chat messages, file content).
- **createModel singletons** — `OpenedFilesModel` and `FileTreeModel` use
  `createModel()` which returns a class. They are instantiated as module-level
  singletons (`new OpenedFilesModel()`, `new FileTreeModel()`). `FileModel` uses
  a `Map` cache keyed by path. Do not create multiple instances of these models.
- **Lexical markdown conversion** — `markdownToEditorState()` creates a headless
  Lexical editor via `buildEditorFromExtensions()` on every call, using the
  shared `editorExtension`. This ensures the bootstrap editor has the same
  extensions (rich text, history, links, lists, code, etc.) as the React-based
  `Editor` island. The bootstrap editor is discarded after its state is
  extracted.
- **createMarkTool not wired in chat** — The chat endpoint
  (`routes/api/chat.ts`) only wires `createReadFileTool`, `createListFilesTool`,
  `createGrepTool`, and `createWriteFileTool`. `createMarkTool` is exported from
  core but not included in the chat tools array.
- **MarkExtension in editor** — `MarksExtension` (in `editor/markExtension.ts`)
  registers `MarkNode` (from `@lexical/mark`). The effect, run from
  `afterRegistration` and bound to the editor's own `path` via
  `configExtension(MarksExtension, { path })`, applies mark ranges to the active
  editor with `$wrapSelectionInMarkNode`. Zero-length marks (text deleted) are
  skipped in the editor since MarkNode can't be empty; they are still surfaced
  in the export preview / sidebar. This is a work in progress (see TODO in
  `signals/marks.ts`).
