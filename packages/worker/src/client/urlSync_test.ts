// @vitest-environment happy-dom
import { computed, signal } from "@preact/signals";
import { expect, test } from "vitest";

import { type QueryRecord, setupUrlSync, type UrlState, urlTarget } from "./urlSync.ts";

function search(): string {
  return new URL(location.href).search;
}

function resetPath(url: string = "/"): void {
  history.replaceState(null, "", url);
}

function pop(): void {
  globalThis.dispatchEvent(new Event("popstate"));
}

/** Round-trips the pop into the query record, one known key at a time, the way
 * the app's own handler decodes only its domain keys. */
function popInto(record: { value: QueryRecord }) {
  return (url: URL) => {
    const next: QueryRecord = {};
    for (const key of Object.keys(record.value)) {
      next[key] = url.searchParams.get(key);
    }
    record.value = next;
  };
}

/** Sync a query record alone, leaving the path to the page. */
function syncQuery(record: { value: QueryRecord }) {
  return setupUrlSync(
    computed((): UrlState => ({ query: record.value })),
    popInto(record),
    urlTarget(),
  );
}

test("writes the record into the query, replacing on boot", () => {
  resetPath();
  const record = signal<QueryRecord>({ wsId: "a", path: null });
  const sync = syncQuery(record);
  expect(search()).toBe("?wsId=a");
  sync();
});

test("pushes history entries for changes after boot", () => {
  resetPath();
  const record = signal<QueryRecord>({ wsId: "a" });
  const sync = syncQuery(record);
  const entries = history.length;
  record.value = { wsId: "b" };
  expect(search()).toBe("?wsId=b");
  expect(history.length).toBe(entries + 1);
  sync();
});

test("clears nullish keys and preserves unknown parameters", () => {
  resetPath("/?utm=1&wsId=a");
  const record = signal<QueryRecord>({ wsId: "a", path: null });
  const sync = syncQuery(record);
  // The boot apply is a no-op for a matching query.
  expect(search()).toBe("?utm=1&wsId=a");
  record.value = { wsId: "c", path: "notes.md" };
  expect(search()).toBe("?utm=1&wsId=c&path=notes.md");
  record.value = { wsId: null, path: "notes.md" };
  expect(search()).toBe("?utm=1&path=notes.md");
  sync();
});

test("applies the query back to the record on pop", () => {
  resetPath();
  const record = signal<QueryRecord>({ wsId: "a", path: null });
  const sync = syncQuery(record);
  history.replaceState(null, "", "/?wsId=b");
  pop();
  expect(record.value.wsId).toBe("b");
  expect(record.value.path).toBe(null);
  history.replaceState(null, "", "/?path=notes.md");
  pop();
  expect(record.value.wsId).toBe(null);
  expect(record.value.path).toBe("notes.md");
  // A pop-applied query is a no-op for the model push.
  const entries = history.length;
  pop();
  expect(history.length).toBe(entries);
  sync();
});

test("a no-op boot pushes for later changes", () => {
  resetPath("/?wsId=a");
  const record = signal<QueryRecord>({ wsId: "a" });
  const sync = syncQuery(record);
  const entries = history.length;
  record.value = { wsId: "b" };
  expect(search()).toBe("?wsId=b");
  expect(history.length).toBe(entries + 1);
  sync();
});

test("keys absent from the record are not owned and stay", () => {
  resetPath("/?wsId=a&path=x.md");
  const record = signal<QueryRecord>({ wsId: "a" });
  const sync = syncQuery(record);
  expect(search()).toBe("?wsId=a&path=x.md");
  sync();
});

test("owns the path when the state gives one", () => {
  resetPath("/editor?utm=1");
  const state = signal<UrlState>({ path: "/editor/demo/essay.md", query: { version: null } });
  const popped: string[] = [];
  const sync = setupUrlSync(state, (url) => popped.push(url.pathname), urlTarget());
  expect(location.pathname).toBe("/editor/demo/essay.md");
  expect(search()).toBe("?utm=1");
  state.value = { path: "/editor/demo/notes/a%20b.md", query: { version: "2" } };
  expect(location.pathname).toBe("/editor/demo/notes/a%20b.md");
  expect(search()).toBe("?utm=1&version=2");
  history.replaceState(null, "", "/editor/demo/essay.md");
  pop();
  expect(popped).toEqual(["/editor/demo/essay.md"]);
  sync();
});
