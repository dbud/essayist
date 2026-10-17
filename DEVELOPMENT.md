# Development Guide

Essayist is a monorepo. `packages/core` (Effect services) and
`packages/worker` (Hono on Workers, Vite + TypeScript 7) form a pnpm
workspace; shared dev tooling (Biome, TypeScript, vitest) lives at the
workspace root. `packages/web` (the Fresh app still serving Deno Deploy),
`packages/kvctl`, and `crates/wasm` are a dormant deno workspace kept for
CI until their migration steps land; see the Linear project "Cloudflare
migration" (ESS-77 through ESS-90) for phase planning.

## Uniform pnpm loop (core and worker)

Commands run from the repo root:

```
pnpm check          # Biome check + tsc --noEmit for core and worker
pnpm fmt            # Biome check --write for core and worker
pnpm lint           # Biome lint for core and worker
pnpm test           # core's full test suite (vitest)
pnpm build          # vite build of the worker package
```

Per-package form: `pnpm -C packages/core <script>` and
`pnpm -C packages/worker <script>`. Scripts on core: check, fmt, lint, test.
Scripts on worker: build, check, deploy, dev, preview, typegen, fmt, lint.

pnpm-workspace.yaml lists `packages/*`, carries the catalog (shared version
ranges for effect, @deno/kv, typescript, biome, vitest, vite) and the
pnpm build-script allowances the worker package needs. There is a single
root pnpm-lock.yaml.

Biome is the single formatter and linter for JS/TS/JSON/CSS; the config is
the root `biome.json`, discovered by walking up from each package. `pnpm
fmt` runs `biome check --write`, which also applies organize-imports and
other safe assists (matching what the old deno task did).

Type checking is `tsc --noEmit` (TypeScript 7) in each package; the
workspace root's binaries are on PATH for member scripts. core's tsconfig
maps `@/` to `src`, includes the `dom` lib for the portable web APIs core
uses, and excludes the deno-boundary files: `kv_layer.ts` (deno entry
points) and the two wasm files.

## Testing (core)

core runs vitest (`pnpm test`; config in `packages/core/vitest.config.ts`).
The suite uses `@std/assert` (via the JSR npm alias) and the npm `@deno/kv`
client's in-memory backend: tests compose `kvLayerCompat` over `openKv()`,
and the shared helper lives in `src/persistence/testing/kv.ts`
(`layerKvCompat`, `testLayer`). The runtime-neutral KV implementation is
`src/persistence/kv_layer_compat.ts`; `kv_layer.ts` keeps only the
deno-facing entry points (`kvLayer`, `layerKv`) used by web and kvctl.

The diff wasm convergence tests (`diff_wasm_test.ts`) are dormant until
the WASM worker returns (ESS-90).

## Deno workspace (dormant)

deno still exists for web (Fresh on Deno Deploy builds), kvctl, and the
wasm pkg, and is frozen for the duration of the Cloudflare migration.
Do not run deno locally: with pnpm's `node_modules` present, deno
switches to a node_modules resolution mode, fails on this layout, and
rewrites `package.json` (adding `workspaces`/`catalog` mirrors of
pnpm-workspace.yaml). If that happens, strip the added fields and rerun
`pnpm install`.

CI is the single pnpm job (install, check, test, worker build) on every
push and PR. The deno CI job and the Deno Deploy release were dropped
while the migration branch churns; its import maps (web's and kvctl's
deno.jsonc plus a `@deno/kv` entry in core's) still resolve the global
cache, so the tasks below keep working if run deliberately.

deno tasks:

```
deno task check     # deno lint + deno check + Biome (deno workspace)
deno task fmt
deno task -f core check
deno task -f web check
```

### Web Development (legacy, until cutover)

```
deno task -f web dev        # Dev server with HMR
deno task -f web build      # Production build (vite build → _fresh/)
deno task -f web favicon    # Regenerate favicon assets
```

Production serving stays on the last frozen Deno Deploy release until
the cutover.

## Workers App (migration)

`packages/worker` is a pnpm workspace package depending on `@essayist/core`
via `workspace:*` (a live source symlink). Its wrangler config sits next to
its vite config (`packages/worker/wrangler.jsonc`, main points to `./src/main.ts`);
no celld compatibility requirement: Cloudflare-only keys (assets, bindings)
are fine to add as the migration needs them.

```
pnpm -C packages/worker dev       # vite dev (wrangler dev with HMR)
pnpm -C packages/worker preview   # preview the built bundle
pnpm -C packages/worker typegen   # regenerate Workers types from wrangler
pnpm -C packages/worker deploy    # manual; CI does not deploy the worker
```

## Favicon

`static/favicon.svg`, `static/favicon.ico` (16/32/48) and
`static/apple-touch-icon.png` are generated from the shared logo mark in
`packages/web/components/ui/logo-mark.ts`, which also feeds the
`EssayistLogo` component. After changing the mark or its palette in
`assets/styles.css`, run `deno task -f web favicon` and commit the results.
CI no longer checks favicons; after changing the mark or its palette in
`assets/styles.css`, run `deno task -f web favicon` and commit the
results (and `favicon:check` to verify).

## WASM

`crates/wasm` compiles the Rust diff core to WASM with `wasm-pack`, emitting
`crates/wasm/pkg/` (imported as `@essayist/wasm`). The pkg is force-tracked in
git so Deno Deploy, which can't build Rust, ships the prebuilt artifact.
Rebuild after changing Rust sources:

```
deno task wasm:build        # Optimized build (what gets committed)
deno task wasm:build:dev    # Unoptimized build for faster iteration
```

During the Cloudflare migration the wasm diff worker is deferred (ESS-90);
the editor ports to the pure-JS diff in core first.

## Pre-commit Checklist

1. `pnpm check`
2. `pnpm test`

The `.husky/pre-commit` hook runs `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` (plus a `wasm-pack` rebuild and
re-staging of `crates/wasm/pkg/`) when Rust files are staged, then
`pnpm check` before every commit.
