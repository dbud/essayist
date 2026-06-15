import type {
  DiffResult,
  FileEntry,
  FileReadResult,
  FileVersion,
  GrepOptions,
  GrepResult,
  Mark,
  MarkResult,
  ReadOptions,
  VFS,
  WriteResult,
} from "@/vfs/types.ts";

/**
 * Sync-compatible overrides for VFS methods.
 * Return plain values; they will be wrapped in Promise.resolve()
 * to satisfy the async VFS interface.
 */
export interface MockVFSOverrides {
  read?: (path: string, options?: ReadOptions) => FileReadResult;
  write?: (path: string, content: string) => WriteResult;
  list?: (prefix?: string) => FileEntry[];
  grep?: (pattern: string, options?: GrepOptions) => GrepResult;
  search?: (text: string, options?: GrepOptions) => GrepResult;
  mark?: (
    path: string,
    versionId: string,
    selectedText: string,
    comment: string,
    label?: string,
  ) => MarkResult;
  getMarks?: (path: string, versionId: string) => Mark[];
  deleteMark?: (markId: string) => boolean;
  getHistory?: (path: string) => FileVersion[];
  revert?: (path: string, versionId: string) => boolean;
  diff?: (path: string, versionA: string, versionB: string) => DiffResult;
}

export function createMockVFS(overrides?: MockVFSOverrides): VFS {
  // deno-lint-ignore no-explicit-any
  const wrap = (fn: ((...args: any[]) => any) | undefined): any =>
    fn ? (...args: unknown[]) => Promise.resolve(fn(...args)) : undefined;

  return {
    read: wrap(overrides?.read),
    write: wrap(overrides?.write),
    list: wrap(overrides?.list),
    grep: wrap(overrides?.grep),
    search: wrap(overrides?.search),
    mark: wrap(overrides?.mark),
    getMarks: wrap(overrides?.getMarks),
    deleteMark: wrap(overrides?.deleteMark),
    getHistory: wrap(overrides?.getHistory),
    revert: wrap(overrides?.revert),
    diff: wrap(overrides?.diff),
  } as unknown as VFS;
}
