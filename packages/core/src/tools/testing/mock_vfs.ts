import type {
  DiffResult,
  FileEntry,
  FileVersion,
  GrepResult,
  Mark,
  MarkResult,
  ReadResult,
  VFS,
  WriteResult,
} from "@/vfs/types.ts";

/** Stub implementations for all VFS methods. */
const stubs: VFS = {
  read: (): ReadResult => ({
    content: "",
    total_lines: 0,
    start_line: 0,
    end_line: 0,
  }),
  write: (): WriteResult => ({ path: "", lines: 0, created: true }),
  list: (): FileEntry[] => [],
  grep: (): GrepResult => ({ matches: [] }),
  mark: (): MarkResult => ({ mark_id: "", marked: false }),
  getMarks: (): Mark[] => [],
  deleteMark: (): boolean => false,
  getHistory: (): FileVersion[] => [],
  revert: (): boolean => false,
  diff: (): DiffResult => ({ diff: "" }),
} as unknown as VFS;

/**
 * Create a mock VFS with the given method overrides.
 * Any method not provided defaults to a stub that returns an empty result.
 *
 * @example
 * ```ts
 * const vfs = createMockVFS({
 *   list: () => [{ path: "essay.txt", lines: 10 }],
 * });
 * ```
 */
export function createMockVFS(overrides?: Partial<VFS>): VFS {
  return { ...stubs, ...overrides } as VFS;
}
