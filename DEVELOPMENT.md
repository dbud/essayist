# Development Guide

Essayist is a monorepo. `packages/core` (Effect services), `packages/worker` (Hono on Workers, Vite

- TypeScript 7), and `packages/kvctl` form a pnpm workspace; shared dev tooling (oxlint, oxfmt,
  TypeScript, vitest) lives at the workspace root. `crates/wasm` holds the Rust diff core; its
  wasm-pack build runs from the pre-commit hook.

## Uniform pnpm loop (core and worker)

Commands run from the repo root:

```
pnpm check          # oxfmt --check, oxlint, then tsc in each package
pnpm fmt            # oxfmt across the repo
pnpm lint           # oxlint across the repo
pnpm test           # vitest across the workspace (core and worker)
pnpm build          # vite build of the worker package
```

Per-package form: `pnpm -C packages/core <script>` and `pnpm -C packages/worker <script>`. Scripts
on core: check, fmt, lint, test. Scripts on kvctl: check, fmt, kvctl, lint. Scripts on worker:
build, check, deploy, dev, favicon, favicon:check, preview, typegen, fmt, lint.

pnpm-workspace.yaml lists `packages/*`, carries the catalog (shared version ranges for effect,
@deno/kv, typescript, oxlint, oxfmt, vitest, vite) and the pnpm build-script allowances the worker
package needs. There is a single root pnpm-lock.yaml.

oxlint and oxfmt are the single linter and formatter; the configs are the root `.oxlintrc.json`
and `.oxfmtrc.json`, discovered by walking up from each package. `pnpm fmt` runs `oxfmt .`, which
also sorts imports and package.json fields, then reflows comments in our source files (`pnpm
fmt:comments`, parfit at width 100) when the `parfit` binary is installed; machines without it skip
that step. oxfmt leaves comment content alone, and `pnpm check` never runs parfit, so a missing
tool cannot fail CI. Sweep commits from a reflow pass belong in `.git-blame-ignore-revs`. Comment
blocks that must keep their column alignment, such as KV key layout tables, carry a `parfit-ignore`
comment line directly above them; parfit then passes the whole block through verbatim. `pnpm check`
starts with `oxfmt --check .` (formatting must be clean) and `oxlint --deny-warnings .` (any finding
fails). Inline suppressions read `// oxlint-disable-next-line <rule> -- <reason>`.

Benchmarks are `*.bench.ts` files next to the sources (see
`packages/core/src/marks/tokenized.bench.ts`); run with `pnpm -C packages/core exec vitest bench`.
The regular `pnpm test` ignores them.

Mechanical reformat commits are listed in the root `.git-blame-ignore-revs`. The prepare script
configures git to read that file after every pnpm install; to set it up by hand, run `git config
blame.ignoreRevsFile .git-blame-ignore-revs`.

Type checking is `tsc --noEmit` (TypeScript 7) in each package; the workspace root's binaries are on
PATH for member scripts. core's tsconfig maps `@/` to `src`, includes the `dom` lib for the portable
web APIs core uses, and excludes the two dormant wasm diff files.

## Testing (core)

core runs vitest (`pnpm test`; config in `packages/core/vitest.config.ts`). The suite uses
`@std/assert` (via the JSR npm alias) and the npm `@deno/kv` client's in-memory backend: tests
compose `kvLayer` over `openKv()`, and the shared helper lives in `src/persistence/testing/kv.ts`
(`layerKvMemory`, `testLayer`). `src/persistence/kv_layer.ts` is the runtime-neutral KV
implementation the tests run on; the D1 adapters (`kv_d1.ts` and its rest/sqlite shims) serve the
live runtimes.

The diff wasm convergence tests (`diff_wasm_test.ts`) are dormant until the WASM worker returns
(ESS-90).

## Workers App

`packages/worker` is a pnpm workspace package depending on `@essayist/core` via
`workspace:*` (a live source symlink). Its wrangler config sits next to its vite config
(`packages/worker/wrangler.jsonc`, main points to `./src/main.ts`); no celld compatibility
requirement: Cloudflare-only keys (assets, bindings) are fine to add as the migration needs them.

```
pnpm -C packages/worker dev       # vite dev (wrangler dev with HMR)
pnpm -C packages/worker preview   # preview the built bundle
pnpm -C packages/worker typegen   # regenerate Workers types from wrangler
pnpm -C packages/worker deploy    # live environment; CI deploys on main pushes
```

Typegen writes an env-only `worker-configuration.d.ts` (committed); rerun it after changing
`wrangler.jsonc` or the `.dev.vars` key set. `.dev.vars` must define `SENTRY_DSN`: the worker
refuses to serve without it, and CI's deploy job fails the same way before deploying.

CI gates every branch push. Pushes to main deploy the live worker once the checks pass; other branch
pushes ship a per-branch preview to workers.dev, with the URL in the run summary. Manual workflow
dispatches choose the target (prod or preview).

## Favicon

`public/favicon.svg`, `public/favicon.ico` (16/32/48) and `public/apple-touch-icon.png` are
generated from the shared logo mark in `packages/worker/src/components/logo/logo-mark.ts`, which
also feeds the `EssayistLogo` component. `pnpm -C packages/worker run favicon` regenerates the
assets (commit the results); `favicon:check` verifies byte parity and runs in CI.

## WASM

`crates/wasm` compiles the Rust diff core to WASM with `wasm-pack`, emitting `crates/wasm/pkg/`
(imported as `@essayist/wasm`). The pkg is force-tracked in git; the pre-commit hook rebuilds and
re-stages it when Rust sources change. The editor currently ports to the pure-JS diff in core; the
wasm diff worker returns with ESS-90, which also brings back a scriptable wasm-pack build (the deno
build tasks retired with that workspace).

## Pre-commit Checklist

- `pnpm check`
- `pnpm test`

The `.husky/pre-commit` hook runs `cargo fmt --check` and `cargo clippy --all-targets -- -D
warnings` (plus a `wasm-pack` rebuild and re-staging of `crates/wasm/pkg/`) when Rust files are
staged, then `pnpm check` before every commit.
