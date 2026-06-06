# Development Guide

This file provides guidance for AI agents and contributors working on this
project. **Read it first** when starting a new thread. Update it when you
discover new information, change structure, or add packages. Prefer keeping this
file current over leaving stale notes elsewhere.

## What This Is

Essayist is a Deno monorepo that wraps the OpenRouter API to build AI-powered
applications. The current features are a country-capital lookup and a file
summarizer that demonstrates the pattern: a typed core library calls an LLM via
OpenRouter, and a Fresh web app exposes it through a simple UI and API.

## Monorepo Structure

Deno workspace with two packages:

- `packages/core/` — `@essayist/core`, shared library code

### Repository Tree

```
essayist/
├── deno.jsonc              # Workspace root (members: web, core, core/integration)
├── deno.lock               # Lockfile
├── .gitignore
├── DEVELOPMENT.md          # ← You are here
├── vendor/                 # Vendored npm dependencies
├── node_modules/           # npm compatibility layer
│
├── packages/
│   ├── core/               # @essayist/core — shared library
│   │   ├── deno.json       # Package config, exports, tasks
│   │   ├── mod.ts          # Public API: getCapital, summarizeFile, Agent, createReadFileTool
│   │   ├── src/
│   │   │   ├── agent.ts         # Agent class — OpenRouter client wrapper
│   │   │   ├── capital.ts       # getCapital() + capitalResponseSchema
│   │   │   ├── capital_test.ts  # Unit tests for getCapital
│   │   │   ├── schema.ts        # Zod→JSON-schema instruction generator + example builder
│   │   │   ├── schema_test.ts
│   │   │   ├── summarize.ts     # summarizeFile() — file summarizer via tool calls
│   │   │   ├── summarize_test.ts
│   │   │   ├── tools/
│   │   │   │   ├── index.ts     # ToolPrompt interface
│   │   │   │   └── read_file.ts # createReadFileTool()
│   │   │   └── tools_test.ts
│   │   └── integration/    # @essayist/core/integration — live API tests
│   │       ├── deno.json
│   │       ├── agent_test.ts       # Hits real OpenRouter API (getCapital)
│   │       ├── summarize_test.ts   # Hits real OpenRouter API (summarizeFile)
│   │       └── utils.ts            # Reads OPENROUTER_API_KEY from env
│   │
│   └── web/                # @essayist/web — Fresh web app
│       ├── deno.json       # Package config, tasks, compiler options
│       ├── main.ts         # App entry: wires middleware + fsRoutes
│       ├── client.ts       # (unused currently)
│       ├── utils.ts        # State type + createDefine helper
│       ├── vite.config.ts  # Vite + Fresh + Tailwind + core watcher plugin
│       ├── _fresh/         # Generated Fresh build output (gitignored)
│       ├── assets/
│       │   └── styles.css  # Tailwind import
│       ├── islands/
│       │   ├── CapitalLookup.tsx  # Interactive Preact island (capital lookup)
│       │   └── Chat.tsx  # Interactive Preact island (streaming chat)
│       ├── middleware/
│       │   └── agent.ts    # Creates Agent from OPENROUTER_API_KEY, attaches to state
│       ├── routes/
│       │   ├── _app.tsx    # HTML shell (imports styles.css)
│       │   ├── index.tsx   # Home page — renders Chat island
│       │   └── api/
│       │       ├── capital.ts  # GET /api/capital?country=… → { country, capital }
│       │       └── chat.ts     # GET /api/chat?message=… → SSE stream
│       ├── utils/
│       │   ├── sse.ts       # SSE streaming helpers (parseSSE, streamModelResultSSE)
│       │   └── useChat.ts   # useChat() hook for consuming SSE in Preact islands
│       └── static/
│           └── favicon.ico
```

### Key Packages

| Package          | Path             | Purpose                                                                                                                       |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@essayist/core` | `packages/core/` | Shared library: `Agent` class (OpenRouter wrapper), `getCapital`, `summarizeFile`, `createReadFileTool`, Zod schema utilities |
| `@essayist/web`  | `packages/web/`  | Fresh 2.x web app (Preact + Tailwind CSS) deployed to Deno Deploy                                                             |

### Important Entry Points

- **`packages/web/main.ts`** — Web app boot. Creates `App`, attaches
  `agentMiddleware`, calls `fsRoutes()`.
- **`packages/core/mod.ts`** — Core library public API. Exports `getCapital`,
  `summarizeFile`, `Agent`, and `createReadFileTool`.
- **`packages/web/routes/api/capital.ts`** — API route. Calls `getCapital` with
  the agent from state.
- **`packages/web/routes/api/chat.ts`** — SSE streaming chat endpoint. Uses
  `Agent` to forward user messages to the LLM and streams tool results.
- **`packages/web/islands/Chat.tsx`** — Interactive Preact island that consumes
  the SSE stream via `useChat`.
- **`packages/web/middleware/agent.ts`** — Middleware. Instantiates `Agent` with
  `OPENROUTER_API_KEY` and attaches it to `ctx.state.agent`.
- **`packages/web/utils/useChat.ts`** and **`packages/web/utils/sse.ts`** —
  Helper utilities for managing the SSE connection and client‑side state.

### Key Dependencies

- **OpenRouter** — `@openrouter/agent` (v^0.7.0) for `callModel`, `tool()`,
  `stepCountIs`, and the `OpenRouter` client class.
- **Zod** (v4) — Schema validation, JSON Schema generation, and metadata for
  structured LLM output.
- **Fresh** (v2.3.3) — Web framework (file-system routing, islands architecture,
  middleware).
- **Preact** (v10.29.1) — UI library (JSX precompiled, not client-side rendered
  except islands).
- **@preact/signals** (v2.9.0) — Reactive signals for Preact islands (used by
  `Chat` and `useChat`).
- **Tailwind CSS** (v4.1.10) — Styling via `@tailwindcss/vite` plugin.
- **daisyUI** (v5.5.20) — Component library built on Tailwind (badge, card, chat
  bubble, hero, etc.).
- **Vite** (v7.1.3) — Dev server and build tool (via `@fresh/plugin-vite`).

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
  its own `deno.json` with scoped imports.
- **Fresh file-system routing** — Routes live in `routes/`, API routes in
  `routes/api/`. Islands (interactive Preact components) live in `islands/`.
- **State management** — `createDefine` pattern from Fresh: `utils.ts` exports a
  typed `define` helper; middleware populates `ctx.state.agent`.
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
- **Vite watches core** — `vite.config.ts` includes a custom `watchCore` plugin
  that adds `packages/core/` to Vite's file watcher so changes to core trigger
  web app reloads.
- **Vendored dependencies** — `deno.jsonc` has `"vendor": true`; npm packages
  are vendored locally.
- **Integration tests** — Live API tests are in a separate workspace member
  (`packages/core/integration/`) with their own `deno.json` and `.env` file.
  They skip gracefully without an API key.
- **Commit messages** — Follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <subject>`. Use imperative mood, capitalize first letter, no
  trailing period. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore`, `revert`.

## Known Gotchas

- **`OPENROUTER_API_KEY` required** — Both the web app and integration tests
  need this env var. The web middleware returns 500 if it's missing; integration
  tests print a warning and exit 0.
- **`client.ts`** — Imports global CSS (`styles.css`) for client‑side rendering.
  It is required by Fresh to inject the stylesheet into the generated HTML, even
  though it isn’t imported directly in other modules.
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
- **`z` no longer re-exported** — `@essayist/core` no longer exports `z`. Import
  Zod directly (`import { z } from "zod"`) in consumer code.
