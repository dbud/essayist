# SSR Experiment — resume notes

## Goal

Render islands on the server from seeded signal models, then hydrate the same
models on the client from a blob in the same GET response — without a REST
fetch for the seeded data and without leaking model state across server
requests. The REST API stays the client-side baseline for mutations/refresh.

## Decided architecture

One **generic, env-aware model store** (`signals/models.ts`) backing every
model's instance cache and its server-provided seed data. Backing is
request-scoped via AsyncLocalStorage on the server, module-level on the
client. The wire boundary is `serialize()`/`ingest()` over **seeds only** —
model instances are not serializable and are rebuilt on the client from the
seed.

Models use two store calls with the same `(namespace, key)` key space:

- `get<T>(ns, key, build)` — instance cache (replaces each model's old local
  `const cache = new Map()`).
- `seed<T>(ns, key)` — the pre-build value, consulted in the factory body so
  it runs at construction on **both** server and client (this is the change
  that makes SSR possible; previously the consult was in `load()`, which is
  client-only).

The blob is literally `serialize(requestScope)`; the client `ingest`s what the
server `setSeed`d. Symmetric: one source of truth, one access API, the env
split hidden behind `scope()`.

## What's implemented

- `signals/models.ts` — the store: `get` / `seed` / `setSeed` / `serialize` /
  `ingest`; `scope()` resolves to ALS request scope (server) or module scope
  (client); client bootstrap reads `#__essayist_seed__` and `ingest`s.
- `signals/models.server.ts` — server-only ALS wiring; imported only by the
  middleware so `node:async_hooks` stays out of the client bundle. Exports
  `runRequest`.
- `middleware/models.ts` + `main.ts` — wraps every request in
  `runRequest(() => ctx.next())`; registered before `authMiddleware`.
- `signals/file.ts`, `fileTree.ts`, `workspace.ts`, `openedFiles.ts` — use
  `models.get` (instance cache) + `models.seed` (factory-body consult); local
  `Map` caches removed.
- `signals/workspace.ts` — `workspaces` is a `Proxy` routing every property
  access to `get("workspaces", "singleton", () => new WorkspacesModel())`, so
  `workspaces.foo` call sites stay unchanged while the instance is
  request-scoped on the server.
- `utils/persistentSignal.ts` — dropped the global signal cache so each model
  instance owns its own signals (otherwise a request-scoped `WorkspacesModel`
  would share `currentWorkspaceId` across requests via the cached signal).
- `routes/index.tsx` — handler seeds four namespaces from `ctx.state.vfs` and
  returns `serialize()` as `data.seed`; page emits
  `<script id="__essayist_seed__" type="application/json">{json}</script>`
  (`<` escaped). Driven by `?ws=<id>&file=<path>` query params.
- `client.ts` — imports `@/signals/models.ts` first so the store is populated
  before any island module runs.

Seed namespaces/keys:
- `workspaces` / `singleton` → `{ list, currentId }`
- `tree` / `<wsId>` → `FileEntry[]`
- `file` / `<wsId>:<path>` → `FileSnapshot`
- `openedFiles` / `<wsId>` → target path to open

## Client-side navigation 

`routes/_app.tsx` has `f-client-nav` on `<html>` and wraps `<Component />` in
`<Partial name="page">` — Fresh's opt-in client-side nav via partials. A
`routes/w/[wsid]/f/[...fileId].tsx` route + `islands/RouteSync.tsx` exists for
path-based URLs; `FileNavigation` links to those paths. The query-param
experiment on `index` is the seed/hydrate test bed (same-route partial nav
re-runs the handler on `?file=` changes).

## The one gate (SSR-content flip)

`FileViewer` returns `null` on the server (`if (!IS_BROWSER) return null;`) —
the Lexical `Editor` React composer is the part that doesn't SSR safely yet.
**`FileNavigation` is not gated**, so it *does* server-render now via the
seeded workspaces Proxy + request-scoped tree model. Removing that one guard
is the SSR-content flip for the viewer, pending Lexical SSR.

## Future steps

1. **Lexical SSR** — remove `FileViewer`'s `if (!IS_BROWSER) return null;`.
   Needs headless HTML export from the seeded `EditorState`
   (`$generateHtmlFromNodes` with a DOM shim) injected as the contenteditable's
   initial innerHTML, with hydration matching. This is the step that puts the
   prose itself into the first HTML byte.

2. **Declarative per-route seed spec** — today `index.tsx` imperatively calls
   `setSeed` for four namespaces. Move to a declarative spec (a `recipes`
   registry + a per-route declaration bound to `ctx.params`), resolved by the
   handler/middleware. This is where the "flexible declarative seeding" lands.

3. **Partial-nav re-seeding** — the blob is read once at client boot and lives
   outside `<Partial>`, so partial nav doesn't re-deliver it; a file first
   opened via partial nav hits REST. Options: re-`ingest` the store from the
   partial response before reviving, or accept REST on partial nav (the
   baseline). Decide based on whether flash-free partial nav matters.

4. **Selection as a first-class concept** — currently the target file is
   seeded via `openedFiles` and applied in the `OpenedFilesModel` factory, with
   the auto-select effect as the no-seed fallback. Consider making "what this
   URL opens" explicit (the `RouteSync`-style URL→selection already exists for
   the path route).

5. **Confirm ALS correctness under concurrency** — verify the
   `node:async_hooks` ALS actually isolates scopes across simultaneous server
   requests (the design depends on it).

6. **More islands server-rendered** — once Lexical SSR is solved, audit other
   islands (RightSidebar, EditorToolbar) for SSR safety and seed coverage.

## Open questions

- Does the `workspaces` Proxy indirection feel right, or should it become an
  explicit `getWorkspaces()` accessor (call-site churn)?
- Should the seed consult stay in the factory body (current) vs. `load()`
  (current = factory body, chosen so SSR works).

## Key files

- `packages/web/signals/models.ts`
- `packages/web/signals/models.server.ts`
- `packages/web/middleware/models.ts`
- `packages/web/signals/{file,fileTree,workspace,openedFiles}.ts`
- `packages/web/utils/persistentSignal.ts`
- `packages/web/routes/index.tsx`
- `packages/web/routes/_app.tsx`
- `packages/web/routes/w/[wsid]/f/[...fileId].tsx`
- `packages/web/islands/{RouteSync,FileNavigation,FileViewer}.tsx`
