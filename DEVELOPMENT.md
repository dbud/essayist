# Development Guide

Essayist is a monorepo: a Deno workspace with `packages/core` (shared logic)
and `packages/web` (Fresh app), plus a Rust `crates/wasm` crate compiled to
WASM for the diff core.

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
deno task -f web dev        # Dev server with HMR
deno task -f web build      # Production build (vite build → _fresh/)
deno task -f web favicon    # Regenerate favicon assets
```

Production builds and serving are handled by Deno Deploy.

## Favicon

`static/favicon.svg`, `static/favicon.ico` (16/32/48) and
`static/apple-touch-icon.png` are generated from the shared logo mark in
`packages/web/components/ui/logo-mark.ts`, which also feeds the
`EssayistLogo` component. After changing the mark or its palette in
`assets/styles.css`, run `deno task -f web favicon` and commit the results.
CI fails on stale favicons (`favicon:check`).

### WASM

`crates/wasm` compiles the Rust diff core to WASM with `wasm-pack`, emitting
`crates/wasm/pkg/` (imported as `@essayist/wasm`). The pkg is force-tracked in
git so Deno Deploy, which can't build Rust, ships the prebuilt artifact.
Rebuild after changing Rust sources:

```
deno task wasm:build        # Optimized build (what gets committed)
deno task wasm:build:dev     # Unoptimized build for faster iteration
```

The pre-commit hook rebuilds and re-stages `crates/wasm/pkg/` automatically
when Rust files are staged (see below), so manual rebuilds are only needed
when iterating locally.

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

The `.husky/pre-commit` hook runs `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` (plus `deno task wasm:build` and
re-staging `crates/wasm/pkg/`) when Rust files are staged, then
`deno task fmt:check` before every commit.
