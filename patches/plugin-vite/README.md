# Vendored @fresh/plugin-vite 1.1.2

Local copy of `jsr:@fresh/plugin-vite@1.1.2` patched for Vite 8 (rolldown).
Wired up via the `patch` field in the root `deno.json`, which overrides the
JSR dependency with this folder (name and version must match).

Source: https://jsr.io/@fresh/plugin-vite/1.1.2

Local changes, taken from https://github.com/freshframework/fresh/pull/3760
(tracking issue: https://github.com/freshframework/fresh/issues/3777):

- `src/mod.ts`
  - `oxc.jsx` config (runtime automatic, importSource preact) alongside
    the Vite 7 `esbuild` config.
  - `rolldownOptions` alongside `rollupOptions` for the client and SSR
    environments. The SSR block adds an `onwarn` filter and externalizes
    `.cjs` files to work around "Cannot use export statement outside a
    module" errors in the SSR build.
- `src/plugins/deno.ts`
  - Drop the `resolvedBy !== "vite:resolve"` check (rolldown does not
    support `resolvedBy`).
  - Optional chaining for `options.attributes` (rolldown does not support
    import attributes).
  - Return `{ id }` objects instead of bare strings for deno specifiers.
- `src/plugins/verify_imports.ts`
  - `PluginContext` type import from `npm:rolldown` instead of `npm:rollup`.
- All `npm:vite@^7.1.4` inline specifiers bumped to `npm:vite@^8.3.0` so
  the plugin shares the app's single Vite 8 instance.
- Removed `src/plugins/shims.ts` and `src/plugins/shims/` (unused: the
  `shims()` plugin was never composed into the plugin list in `mod.ts`).

Remove this folder and the `patch` entry once `@fresh/plugin-vite`
publishes Vite 8 support.

## Verifying changes in this folder

The root deno/biome configs exclude this folder (vendored code would
fail the app's style gates), so run its own checks after editing:

```
deno check --config patches/plugin-vite/deno.json patches/plugin-vite/src/mod.ts patches/plugin-vite/src/client.ts
deno lint --config patches/plugin-vite/deno.json patches/plugin-vite/src/
deno task -f web check
```

The first two use this folder's own deno.json so `vite/client` types
resolve; the web check covers the consumer side. A plain build does not
type-check plugin code, so do not rely on it alone.
