/// <reference types="vite/client" />

/** The D1 migrations, bundled by Vite. Wrangler reads the same `.sql` files from this directory. */

const files = import.meta.glob<string>("./*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface Migration {
  name: string;
  sql: string;
}

/** In file name order, as `wrangler d1 migrations apply` runs them. */
export const migrations: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ name: path.slice("./".length), sql }))
  .toSorted((a, b) => a.name.localeCompare(b.name));
