# Development Guide

## Monorepo Structure

Deno workspace with two packages:

- `packages/core/` — `@essayist/core`, shared library code
- `packages/web/` — `@essayist/web`, Fresh web app (Preact + Tailwind CSS)

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
