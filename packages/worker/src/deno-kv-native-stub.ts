// Stub for @deno/kv's optional platform bindings (native SQLite backends),
// aliased in vite.config so the worker bundle does not pull binary files.
// The KV Connect remote path never loads them; Deno-side and vitest runs use
// the real package.
export {};
