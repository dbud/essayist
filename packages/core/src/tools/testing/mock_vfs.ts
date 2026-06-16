import type { VFS } from "@/vfs/types.ts";

type Syncify<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => R
    : never;
};

export type MockVFSOverrides = Syncify<VFS>;

function wrap<A extends unknown[], R>(fn?: (...args: A) => R) {
  return fn
    ? (...args: A): Promise<Awaited<R>> => Promise.resolve(fn(...args))
    : undefined;
}

export function createMockVFS(overrides: MockVFSOverrides = {}): VFS {
  return {
    read: wrap(overrides.read),
    write: wrap(overrides.write),
    list: wrap(overrides.list),
    grep: wrap(overrides.grep),
    search: wrap(overrides.search),
    mark: wrap(overrides.mark),
    getMarks: wrap(overrides.getMarks),
    deleteMark: wrap(overrides.deleteMark),
    getHistory: wrap(overrides.getHistory),
    revert: wrap(overrides.revert),
    diff: wrap(overrides.diff),
  } as VFS;
}
