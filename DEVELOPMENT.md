# Development Guide

This file provides guidance for AI agents and contributors working on this
project. **Read it first** when starting a new thread. Update it when you
discover new information, change structure, or add packages. Prefer keeping this
file current over leaving stale notes elsewhere.

## What This Is

Essayist is a Deno monorepo that wraps the OpenRouter API to build AI-powered
writing tools. The core library provides an `Agent` class that calls LLMs via
OpenRouter, a virtual file system with versioning and annotation support, and a
set of file-manipulation tools the LLM can invoke. It also provides a
workspace/user model (`WorkspaceStore`) so files are scoped per workspace and
workspaces can be shared between users. A Fresh web app exposes a chat
interface backed by these tools, a file browser, and a file viewer with
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
    │   │   ├── persistence/
    │   │   │   ├── mod.ts            # PersistenceAdapter (tuple keys, batch, checks) + InMemoryAdapter
    │   │   │   ├── mod_test.ts
    │   │   │   ├── kv_adapter.ts     # KvAdapter — Deno KV backing (needs --unstable-kv)
    │   │   │   └── kv_adapter_test.ts
    │   │   ├── vfs/
    │   │       ├── types.ts         # VFS interface + all result types
    │   │       ├── vfs.ts           # VirtualFileSystem (full VFS impl)
    │   │       ├── vfs_test.ts      # Tests for read, write, list, grep, versioning
    │   │       ├── vfs_marks_test.ts # Tests for mark, getMarks, deleteMark, migration
    │   │       ├── diff.ts          # Per-word diff
    │   │       ├── diff_test.ts
    │   │       ├── unified_diff.ts  # unifiedDiff() — unified diff formatter
    │   │       ├── unified_diff_test.ts
    │   │       ├── text_search.ts   # Exact + token-multiset text search for mark anchoring
    │   │       ├── text_search_test.ts
    │   │       ├── text_utils.ts     # createTokenizer + trimContextSeparators helpers
    │   │       ├── text_utils_test.ts
    │   │       ├── levenshtein.ts   # Levenshtein distance for fuzzy matching
    │   │       ├── levenshtein_test.ts
    │   │       ├── marks_resolver.ts   # Mark migration across versions + fuzzy find
    │   │       ├── marks_resolver_test.ts
    │   │       └── testing/
    │   │           └── helpers.ts       # createVFS(), createFile() test helpers
    │   │   └── workspace/
    │   │       ├── types.ts       # User, Workspace, WorkspaceMember, Role, errors
    │   │       ├── store.ts       # WorkspaceStore — users/workspaces/members over PersistenceAdapter
    │   │       └── store_test.ts
    │   └── integration/    # @essayist/core/integration — live API tests
    │       ├── deno.json
    │       ├── summarize_test.ts   # Hits real OpenRouter API (summarizeFile)
    │       ├── tools_test.ts       # Integration tests for list_files, grep, write_file
    │       └── utils.ts            # Reads OPENROUTER_API_KEY from env
    │
    └── web/                # @essayist/web — Fresh web app
        ├── deno.jsonc      # Package config, tasks, compiler options
        ├── main.ts         # App entry: wires agent + auth middleware, fsRoutes
        ├── client.ts       # Imports global CSS (required by Fresh)
        ├── define.ts       # State type (agent, user, vfs, workspaceId) + createDefine helper
        ├── signals.ts      # activeEditor signal (Lexical editor instance)
        ├── store.ts        # Shared KvAdapter + WorkspaceStore; seeds demo user/workspace
        ├── seed.ts         # seedDemoFiles(vfs, workspace) — sample files, marks, workspace-{id}.md readme
        ├── vite.config.ts  # Vite + Fresh + Tailwind + core watcher plugin
        ├── _fresh/         # Generated Fresh build output (gitignored)
        ├── assets/
        │   └── styles.css  # Tailwind import + custom "essayist" daisyUI theme
        ├── components/
        │   ├── Avatar.tsx         # User avatar (picture or fallback icon)
        │   ├── BlockTypeSelect.tsx  # Block-type dropdown (icons per option) using Dropdown
        │   ├── Dialog.tsx         # Reusable daisyUI modal shell (native <dialog>, Signal-driven open)
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
        │   └── useChat.ts          # useChat() hook — SSE chat for Preact islands (takes a URL getter)
        ├── islands/
        │   ├── Chat.tsx            # Interactive Preact island (streaming chat UI)
        │   ├── CreateWorkspaceDialog.tsx # "New project" modal body (uses Dialog)
        │   ├── UserMenu.tsx      # Navbar account dropdown (email, clear cache, sign out)
        │   ├── ErrorBoundary.tsx   # Preact error boundary with reset button
        │   ├── ExportPreviewSection.tsx  # Export preview with mark highlighting + whitespace viz
        │   ├── FileBrowser.tsx     # File tree sidebar (fetches from /api/workspaces/:wsId/files)
        │   ├── FileViewer.tsx      # File content viewer (markdown or plain text)
        │   ├── FileViewerTabs.tsx # Open file tabs
        │   ├── LexicalTreeViewSection.tsx  # Debug panel showing active Lexical editor state
        │   ├── MarkRangesSection.tsx  # Debug panel showing resolved mark ranges as JSON
        │   ├── MarksSection.tsx    # Displays marks for the selected file, grouped by thread
        │   ├── Section.tsx         # Collapsible sidebar section (details/summary)
        │   ├── Sidebar.tsx       # File-browser sidebar shell (responsive overlay/column)
        │   ├── SidebarToggle.tsx # Button to collapse/expand the file-browser sidebar
        │   ├── WorkspaceMenu.tsx   # Navbar project switcher + creator ("Project:" dropdown)
        │   └── editor/
        │       ├── ActiveEditorRef.tsx  # EditorRefPlugin wrapper that sets/clears activeEditor
        │       └── Editor.tsx           # Lexical rich text editor island component
        ├── middleware/
        │   ├── agent.ts    # Creates Agent from OPENROUTER_API_KEY, attaches to state
        │   └── auth.ts    # Resolves ctx.state.user: X-User-Id header (dev only), OAuth session, or dev demo user
        ├── routes/
        │   ├── _app.tsx    # HTML shell (navbar w/ WorkspaceMenu + UserMenu, h-dvh body, theme)
        │   ├── index.tsx   # Home page — three-column layout (browser, viewer, sidebar)
        │   ├── login.tsx    # Sign-in landing page (Sign in with Google button)
        │   ├── oauth/
        │   │   ├── signin.ts    # GET — redirects to Google consent
        │   │   ├── callback.ts  # GET — exchanges code, upserts User by email, stores session
        │   │   └── signout.ts   # GET — clears session cookie + app session, redirects home
        │   └── api/
        │       └── workspaces/
        │           ├── index.ts                  # GET /api/workspaces (list mine), POST (create + seed sample files)
        │           └── [wsId]/
        │               ├── _middleware.ts        # Resolve workspace, access check, scoped VFS on state (403)
        │               ├── index.ts              # GET /api/workspaces/:wsId (detail)
        │               ├── chat.ts               # GET .../chat?message=… → SSE stream (tools per-request)
        │               ├── files/
        │               │   ├── index.ts          # GET .../files → file list
        │               │   ├── [path].ts         # GET .../files/:path → file content
        │               │   └── [path]/
        │               │       └── marks.ts      # GET .../files/:path/marks → file marks
        │               └── members/
        │                   ├── index.ts          # GET .../members (list), POST (add/update, owner-only)
        │                   └── [userId].ts       # DELETE .../members/:userId (remove, owner-only)
        ├── signals/
        │   ├── file.ts            # FileModel(wsId, path) — per-(ws,path) file content + editor state
        │   ├── fileTree.ts        # FileTreeModel(wsId) + getFileTree/getFileTreeFor + buildFileTree()
        │   ├── marks.ts           # MarksModel(wsId, path) — per-(ws,path) marks + resolve/ranges
        │   ├── openedFiles.ts     # OpenedFilesModel(wsId) — per-workspace selected/opened/history
        │   ├── preferences.ts     # viewerFont, viewMode persistent signals
        │   ├── workspace.ts       # WorkspacesModel singleton (workspaces): currentWorkspaceId + list + load/select/create
        │   └── editorSelection.ts # EditorSelectionModel(wsId, path) — per-(ws,path) toolbar/cursor state
        ├── utils/
        │   ├── asyncState.ts            # createAsyncState(initialLoading?) — loading/error state helper
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
| `@essayist/core`             | `packages/core/`             | Shared library: `Agent`, `summarizeFile`, VFS, tools, `resolveMarks`, `WorkspaceStore` (users/workspaces/members), Zod schema utilities |
| `@essayist/core/integration` | `packages/core/integration/` | Live API tests (require `OPENROUTER_API_KEY`)                                              |
| `@essayist/web`              | `packages/web/`              | Fresh 2.x web app (Preact + Tailwind CSS + daisyUI) deployed to Deno Deploy                |

### Important Entry Points

- **`packages/web/main.ts`** — Web app boot. Creates `App`, attaches
  `agentMiddleware` and `authMiddleware`, calls `fsRoutes()`.
- **`packages/core/mod.ts`** — Core library public API. Exports `summarizeFile`,
  `Agent`, tool factories (`createReadFileTool`, `createListFilesTool`,
  `createGrepTool`, `createWriteFileTool`, `createMarkTool`), `resolveMarks`
  (mark migration resolver), `VirtualFileSystem`, the persistence layer
  (`PersistenceAdapter`, `InMemoryAdapter`, `KvAdapter`, tuple-key helpers),
  `WorkspaceStore`, and workspace/User types (`User`, `Workspace`,
  `WorkspaceMember`, `Role`).
- **`packages/web/store.ts`** — Shared `InMemoryAdapter` + `WorkspaceStore`
  for the web app, and the dev-mode seed: a demo user, `demoUser2`, and a demo
  workspace (with sample files via `seedDemoFiles`). Exports `adapter`,
  `store`, `demoUser`, `demoUser2`, `demoWorkspace`.
- **`packages/web/middleware/auth.ts`** — Auth middleware. Resolves
  `ctx.state.user` per request in this order: `X-User-Id` header (dev only
  — local scripting/sharing tests; disabled in production), a Google OAuth
  session cookie (see `routes/oauth/`), the seeded demo user (dev only), or
  401 (API) / redirect-to-`/login` (pages). The `/oauth/*` routes and `/login`
  page are skipped so sign-in / callback / sign-out / the login page can run
  without a resolved user.
- **`packages/web/routes/api/workspaces/[wsId]/_middleware.ts`** — Workspace
  middleware. Reads `ctx.params.wsId`, runs `store.hasAccess`, returns 403 on
  no access, and constructs a per-request `VirtualFileSystem(adapter, wsId)` on
  `ctx.state.vfs` + `ctx.state.workspaceId`.
- **`packages/web/routes/api/workspaces/index.ts`** — `GET /api/workspaces`
  (list the current user's workspaces) and `POST` (create a workspace owned by
  the current user).
- **`packages/web/routes/api/workspaces/[wsId]/chat.ts`** — SSE streaming chat
  endpoint. Builds read/list/grep/write tools per request against
  `ctx.state.vfs` and uses `Agent.callModelWithTools` to stream responses.
- **`packages/web/routes/api/workspaces/[wsId]/files/index.ts`** — GET
  `.../files`. Lists all files in the resolved workspace VFS.
- **`packages/web/routes/api/workspaces/[wsId]/files/[path].ts`** — GET
  `.../files/:path`. Reads a single file from the workspace VFS.
- **`packages/web/routes/api/workspaces/[wsId]/members/index.ts`** — GET
  `.../members` (list) and POST (add/update a member; owner-only, 404 on
  unknown user, 409 on last-owner demote).
- **`packages/web/routes/api/workspaces/[wsId]/members/[userId].ts`** — DELETE
  `.../members/:userId` (remove a member; owner-only, 409 on last-owner
  removal).
- **`packages/web/signals/workspace.ts`** — `WorkspacesModel` (a
  `createModel` singleton exported as `workspaces`) owning the persistent
  `currentWorkspaceId` signal, the `list` signal (workspace array), a `current`
  computed signal, and `loading`/`error` async state. Methods: `load()` bootstraps
  from `GET /api/workspaces` on the client; `select(id)` switches the active
  workspace; `create(name)` POSTs and selects the new workspace. UI copy calls
  workspaces "projects"; the underlying API/types stay `Workspace`.
- **`packages/web/islands/WorkspaceMenu.tsx`** — Navbar project switcher.
  Dropdown (reusing `components/Dropdown`) showing the active project name with
  a `BriefcaseBusiness` icon; lists all projects to switch via `workspaces.select`,
  and a "New project" item that opens `CreateWorkspaceDialog`. Returns a disabled
  spinner button while `workspaces.loading` (no dropdown). Not rendered when
  `state.user` is unset (see `_app.tsx`).
- **`packages/web/islands/CreateWorkspaceDialog.tsx`** — Body of the "New project"
  modal: name input, inline error, loading spinner, calls `workspaces.create`.
  Uses the reusable `components/Dialog` shell.
- **`packages/web/components/Dialog.tsx`** — Reusable daisyUI modal backed by a
  native `<dialog>`. Parent owns an `open: Signal<boolean>`; the component mirrors
  it into `showModal()`/`close()` via an effect. Caller provides the body
  (forms / `modal-action` buttons) as children; `title` is optional. Used by
  `CreateWorkspaceDialog` and ready for confirm dialogs (e.g. member removal).
- **`packages/web/islands/Chat.tsx`** — Interactive Preact island that consumes
  the SSE stream via `useChat`. Renders chat bubbles, tool calls, reasoning, and
  a message input form.
- **`packages/web/islands/FileViewer.tsx`** — File content viewer island. Gets
  `wsId` + `path` from `getOpenedFiles()` + `workspaces.currentWorkspaceId`, gates
  on both, and passes them down to `FileViewerBody` which calls `getFile(wsId, path)`
  and `getMarks(wsId, path)`. Renders the Lexical `Editor` plus a `Toolbar` with
  `FontSelect` and `EditorToolbar`. Per-(workspace, path) so the right file shows
  after a switch (no stale-content race).
- **`packages/web/islands/FileBrowser.tsx`** — File tree sidebar island. Calls
  `getFileTree()` (current workspace or `null`), reads the `tree`/`loading`/`error`
  signals from the per-workspace `FileTreeModel`, and renders a collapsible tree
  with folders and files. Long names wrap mid-word (`break-all min-w-0`).
- **`packages/web/components/Tabs.tsx`** — Generic horizontal tab strip: hides
  the native scrollbar, shows ◀/▶ only on overflow (disabled when the direction
  isn't available), and keeps the active tab scrolled into view.
- **`packages/web/islands/FileViewerTabs.tsx`** — Open file tabs with close
  buttons, rendered via `Tabs`. Calls `getOpenedFiles()` and threads `wsId` to
  each `Tab`, which calls `getFile(wsId, path)` for `dirty`/`isSelected`.
- **`packages/web/islands/Section.tsx`** — Collapsible sidebar section using
  `<details>`/`<summary>` with daisyUI `collapse` styling.
- **`packages/web/islands/ErrorBoundary.tsx`** — Preact error boundary island
  using `useErrorBoundary`. Renders error message with a "Try again" reset
  button.
- **`packages/web/islands/LexicalTreeViewSection.tsx`** — Debug panel that
  displays the active Lexical editor's JSON state. Renders inside a collapsible
  `Section` titled "Lexical Editor".
- **`packages/web/islands/MarksSection.tsx`** — Displays marks for the currently
  selected file. Gets `wsId` + `path` from `getOpenedFiles()` + `workspaces.currentWorkspaceId`,
  reads `getMarks(wsId, path)` and `getEditorSelection(wsId, path).markIds`, groups
  marks by `thread_id`, and renders each group as a daisyUI card. Each mark shows:
  label, status badge (resolved/stale), selected text, comment, offset, length.
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
  newlines as `¬`). Lists stale marks separately below the preview. `MarkdownPreview`
  takes `wsId` + `path` and reads `getFile(wsId, path).markdown` and
  `getMarks(wsId, path).resolved`.
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
- **`packages/web/signals/openedFiles.ts`** — `OpenedFilesModel` is
  per-workspace: `createModel((workspaceId) => {…})` with persistent signals
  keyed `selectedFile:<wsId>` / `openedFiles:<wsId>` / `fileHistory:<wsId>`
  and `open()`/`close()` helpers. Cached by workspace id (`Map`); accessors
  `getOpenedFilesFor(wsId)` and `getOpenedFiles()` (current workspace or `null`).
  A module-level effect auto-manages the sidebar based on the current
  workspace's opened files (expand when empty, close overlay once a file is
  selected).
- **`packages/web/signals/fileTree.ts`** — `FileTreeModel` is per-workspace
  (`createModel((workspaceId) => {…})`), fetching `/api/workspaces/:wsId/files`
  on construction (`if (IS_BROWSER) void load()`). `createAsyncState(true)` so
  SSR shows the loading state. Cache keyed `<wsId>`; accessors `getFileTreeFor(wsId)`
  and `getFileTree()` (current or `null`). `buildFileTree(files, workspaceId)`
  builds the `TreeNode` tree; `isSelected` reads `getOpenedFilesFor(workspaceId).selected`.
- **`packages/web/signals/file.ts`** — `FileModel` is per-(workspace, path):
  `createModel((workspaceId, path) => {…})` fetching
  `/api/workspaces/:wsId/files/:path` on construction. Owns `snapshot`, `content`,
  `initialState`, `modifiedState`, `state`, `markdown`, `initialMarkdown`, `dirty`,
  `isSelected` (via `getOpenedFilesFor(workspaceId)`), `textNodeSpans`, and
  `getNodeRange(span)`. Cache keyed `<wsId>:<path>`; accessor `getFile(wsId, path)`.
- **`packages/web/signals/marks.ts`** — `MarksModel` is per-(workspace, path):
  `createModel((workspaceId, path) => {…})` calling `getFile(workspaceId, path)`
  for content/markdown/getNodeRange, fetching `…/files/:path/marks` on construction,
  and resolving marks in the wasm worker (`asyncComputed`, debounced). Exposes
  `marks`, `resolved`, `ranges`, `loading`, `error`, `reload`, `resolving`. Cache
  keyed `<wsId>:<path>`; accessor `getMarks(wsId, path)`. `RangedMark` and
  `MarkWithRange` interfaces.
- **`packages/web/signals/preferences.ts`** — `viewerFont` and `viewMode`
  persistent signals.
- **`packages/web/signals/editorSelection.ts`** — `EditorSelectionModel` is
  per-(workspace, path): `createModel((workspaceId, path) => {…})` holding the
  toolbar/cursor state (`block`, `bold`, `italic`, `strikethrough`, `code`,
  `inCodeBlock`, `markIds`). Written by `ToolbarStateExtension` and
  `MarksAtCursorExtension` (injected via extension config); read by `EditorToolbar`
  and `MarksSection`. `defaultEditorSelection` is a sink used as default config.
  Cache keyed `<wsId>:<path>`; accessor `getEditorSelection(wsId, path)`.
- **`packages/web/components/EditorToolbar.tsx`** — Toolbar for the active
  editor: bold/italic/strikethrough/inline-code toggle buttons plus a block-type
  dropdown (normal, heading 1-3, quote, code block, bullet/numbered list).
  Reads `activeEditor` (to dispatch commands) and `useEditorSelection(path)`
  (for active state). Inline formats use `FORMAT_TEXT_COMMAND`; lists use
  Lexical's list commands; block conversions use `$setBlocksType`
  (`editor/blockFormat.ts`). Inline buttons are disabled inside a code block.
- **`packages/web/editor/marksAtCursorExtension.ts`** — `MarksAtCursorExtension`,
  registered in `afterRegistration`, writes the set of mark `thread_id`s at the
  selection anchor into the injected `EditorSelection.markIds` signal on every
  update / selection change. Walks the anchor's ancestor chain collecting
  `MarkNode` ids (handles nested/overlapping marks). Kept separate from
  `ToolbarStateExtension`; both subscribe to selection changes independently.
- **`packages/web/editor/toolbarStateExtension.ts`** — `ToolbarStateExtension`,
  registered in `afterRegistration`, writes the selection-derived block type,
  inline format flags, and `inCodeBlock` into the injected `EditorSelection`
  model on every update / selection change.
- **`packages/web/editor/markExtension.ts`** — `MarksExtension` applies mark
  ranges to the editor (signals for `ranges`/`textNodeSpans`/`markdown` are
  injected via config from `Editor.tsx`, the composition root) and registers
  `SELECT_MARK_COMMAND` (dispatch a thread id to place the caret at that mark).
  `Editor.tsx` calls `useMarks`/`useFile`/`useEditorSelection` and injects the
  signals into `createEditorExtension(path, deps)`.
- **`packages/web/seed.ts`** — `seedDemoFiles(vfs, workspace)` seeds a workspace
  VFS with the sample files (essay.txt, report.txt, notes/ideas.md, notes/todo.md,
  notes/archive/, src/main.ts, src/utils.ts, markdown-showcase.md), a few marks,
  and a per-workspace `workspace-<wsId>.md` readme recording the workspace's name
  and id. Called from `store.ts` for the demo workspace AND from
  `routes/api/workspaces/index.ts` for every newly created workspace so it isn't
  empty on first open. There is no global VFS singleton; a `VirtualFileSystem` is
  constructed per request, scoped by workspace id, in the `[wsId]/_middleware.ts`.
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
  `createModel()` for the per-key stateful model pattern (`WorkspacesModel`,
  `OpenedFilesModel`, `FileTreeModel`, `FileModel`, `MarksModel`,
  `EditorSelectionModel`).
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
- **@biomejs/biome** (v2.5.0) — Formatter and linter for JS/TS/JSON/CSS. The
  project uses Biome exclusively for formatting (`deno task fmt` / `deno task
  fmt:check`); do not use `deno fmt`.

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
  Stateful models use `createModel()` from `@preact/signals`.
- **Per-workspace models** — Most signal models are scoped per workspace (and
  per path where relevant): `OpenedFilesModel(wsId)`, `FileTreeModel(wsId)`,
  `FileModel(wsId, path)`, `MarksModel(wsId, path)`, `EditorSelectionModel(wsId,
  path)`. Each instance closes over its key(s) and loads itself on construction
  (`if (IS_BROWSER) void load()`), so switching workspaces looks up a different
  cached instance rather than re-fetching into shared signals (which avoids a
  mid-load race where the old workspace's fetch would clobber the new one's
  state). `WorkspacesModel` is the one true singleton (one list of workspaces per
  app). Cache keys are flat strings: `<wsId>` or `<wsId>:<path>`.
- **Accessor naming** — Cached model accessors use a `get*` prefix (not `use*`,
  which is reserved for real hooks and would trip `react-rules-of-hooks`). Forms:
  `get<Model>(wsId, path)` / `get<Model>For(wsId)` for explicit keys,
  `get<Model>()` (e.g. `getOpenedFiles`, `getFileTree`) for the current
  workspace (returns `null` while no workspace is selected). Real hooks keep
  `use*` (`useChat`, `useMediaQuery`, `useSmallScreen`, `usePersistentSignal`).
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
  backed by a `PersistenceAdapter` (in `src/persistence/`). `InMemoryAdapter` is
  the in-memory store used in tests/dev; `KvAdapter` backs it with Deno KV in
  production (requires `--unstable-kv`). The VFS supports read (with line-range
  and numbering options), write,
  list (with directory prefix filtering), grep (regex), search (literal text),
  versioning (history, revert), and unified diff between versions. Marks are
  text-span annotations bound to specific versions, with automatic migration
  across versions via diff-based offset mapping and fuzzy matching
  (`marks_resolver.ts`). `mark()` accepts an optional `MarkOptions` bag
  (`label`, `lineHint`, `threadId`, `contextSpan`). `lineHint` is a 1-based
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
- **Auth (Google OAuth) + seeding** — `middleware/auth.ts` resolves
  `ctx.state.user` from, in order: an `X-User-Id` header (dev only — a
  client-supplied id is not authentication, so this is gated behind `isDev`
  and is dead code in production), a Google OAuth session cookie
  (`routes/oauth/`, backed by `@deno/kv-oauth` and the app session map in
  `utils/sessions.ts`), the seeded demo user (dev only), or
  401/redirect-to-`/login`. Requires `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` env vars to actually sign in; without them, dev falls
  back to the demo user. `store.ts` seeds a demo user, a second demo user
  (`demoUser2`) for sharing tests, and a demo workspace (with sample files) on
  every startup, using random ids. The client discovers the workspace id via
  `GET /api/workspaces`. The store uses a `KvAdapter` backed by Deno KV
  (`local-kv.sqlite3` in dev, platform KV on Deno Deploy).
- **Fresh build output** — `_fresh/` is gitignored. Production builds are
  handled by Deno Deploy (`deno deploy` org: `dbud`, app: `essayist`).
- **Route files aren't in `main.ts`'s type-check graph** — `app.fsRoutes()`
  loads route files via dynamic import, so `deno check packages/web/main.ts`
  does **not** type-check them. A bad import in a route can pass `deno check
  main.ts` yet throw at runtime. Always validate with the full `deno task
  fmt:check` (which runs `deno check` with no args, walking the whole tree) or
  `deno check packages/web/routes`, not `deno check <entry>`.
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
  shared across the app, keyed by a fixed string. `usePersistentSignal()` is a
  hook that creates per-island signals synced to localStorage. Per-workspace
  persistent state (selected file, opened files, history) does NOT use a
  dynamic-key signal helper; instead it lives inside `OpenedFilesModel(wsId)`,
  which closes over a fixed `wsId` and uses `persistentSignal(`key:${wsId}`, …)`
  so each workspace has its own localStorage slot.
- **Per-workspace model caches** — `WorkspacesModel` is a true singleton
  (`new WorkspacesModel()` at module load). The per-workspace / per-(workspace,
  path) models (`OpenedFilesModel`, `FileTreeModel`, `FileModel`, `MarksModel`,
  `EditorSelectionModel`) are NOT instantiated directly by consumers; they go
  through the `get*` accessors, which cache instances in a `Map` keyed by
  `<wsId>` or `<wsId>:<path>`. Each instance loads itself on construction
  (`if (IS_BROWSER) void load()`), so the `onWorkspaceChange(load)` pattern that
  used to re-fire a shared model's `load` on switch is gone (helper removed).
- **Lexical markdown conversion** — `markdownToEditorState()` creates a headless
  Lexical editor via `buildEditorFromExtensions()` on every call, using the
  shared `editorExtension`. This ensures the bootstrap editor has the same
  extensions (rich text, history, links, lists, code, etc.) as the React-based
  `Editor` island. The bootstrap editor is discarded after its state is
  extracted.
- **createMarkTool not wired in chat** — The chat endpoint
  (`routes/api/workspaces/[wsId]/chat.ts`) only wires `createReadFileTool`,
  `createListFilesTool`, `createGrepTool`, and `createWriteFileTool`.
  `createMarkTool` is exported from core but not included in the chat tools
  array.
- **MarkExtension in editor** — `MarksExtension` (in `editor/markExtension.ts`)
  registers `MarkNode` (from `@lexical/mark`). Run from `afterRegistration`, it
  applies mark ranges to the active editor with `$wrapSelectionInMarkNode`.
  The mark/file signals (`ranges`, `textNodeSpans`, `markdown`) are injected via
  config from `Editor.tsx` (the composition root) rather than imported as
  `useX` accessors inside the extension — this keeps the editor layer decoupled
  from the signal/store layer and avoids `react-rules-of-hooks` friction. It
  also registers `SELECT_MARK_COMMAND` (dispatch a thread id to jump the caret
  to that mark). Zero-length marks (text deleted) are skipped in the editor
  since MarkNode can't be empty; they are still surfaced in the export preview
  / sidebar. This is a work in progress (see TODO in
  `signals/marks.ts`).
