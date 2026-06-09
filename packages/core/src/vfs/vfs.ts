import { unifiedDiff } from "@/vfs/diff.ts";
import type { PersistenceAdapter } from "./persistence.ts";
import type {
  DiffResult,
  FileEntry,
  FileVersion,
  GrepOptions,
  GrepResult,
  Mark,
  MarkResult,
  ReadResult,
  VFS,
  WriteResult,
} from "./types.ts";

const FILE_PREFIX = "file:";
const VERSIONS_PREFIX = "versions:";
const MARKS_PREFIX = "marks:";
const GREP_CONTEXT_LINES = 2;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let markCounter = 0;
let versionCounter = 0;

export class VirtualFileSystem implements VFS {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  read(
    path: string,
    startLine?: number,
    endLine?: number,
    numbered?: boolean,
  ): ReadResult {
    const content = this.#getFile(path);

    if (content === "") {
      return {
        content: "",
        total_lines: 0,
        start_line: 0,
        end_line: 0,
      };
    }

    const allLines = content.split("\n");
    const totalLines = allLines.length;

    const start = Math.max(1, startLine ?? 1);
    const end = Math.min(totalLines, endLine ?? totalLines);

    let selectedLines = allLines.slice(start - 1, end);

    if (numbered) {
      selectedLines = selectedLines.map(
        (line, i) => `${String(start + i).padStart(6)}: ${line}`,
      );
    }

    return {
      content: selectedLines.join("\n"),
      total_lines: totalLines,
      start_line: start,
      end_line: end,
    };
  }

  write(path: string, content: string): WriteResult {
    const existed = this.#adapter.get(this.#fileKey(path)) !== undefined;

    if (existed) {
      this.#snapshotVersion(path);
    }

    this.#adapter.set(this.#fileKey(path), content);

    return {
      path,
      lines: content.split("\n").length,
      created: !existed,
    };
  }

  list(prefix?: string): FileEntry[] {
    const searchPrefix = prefix ? `${FILE_PREFIX}${prefix}` : FILE_PREFIX;

    const entries: FileEntry[] = [];

    const iter = this.#adapter.list(searchPrefix);
    const processKey = (key: string) => {
      if (key.startsWith(FILE_PREFIX)) {
        const path = key.slice(FILE_PREFIX.length);
        const content = this.#getFile(path);
        entries.push({
          path,
          lines: content.split("\n").length,
        });
      }
    };

    if (Symbol.iterator in iter) {
      for (const key of iter as Iterable<string>) {
        processKey(key);
      }
    } else {
      throw new Error(
        "Async persistence adapters require async VFS methods. " +
          "Use InMemoryAdapter for synchronous operation.",
      );
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    return entries;
  }

  grep(pattern: string, options?: GrepOptions): GrepResult {
    const { path, caseSensitive = false, maxResults = 50 } = options ?? {};
    const flags = caseSensitive ? "g" : "gi";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      regex = new RegExp(escapeRegex(pattern), flags);
    }

    const results: GrepResult = { matches: [] };
    const allFiles = this.list().map((f) => f.path);
    const files = path ? allFiles.filter((f) => f.startsWith(path)) : allFiles;

    for (const filePath of files) {
      if (results.matches.length >= maxResults) break;

      const content = this.#getFile(filePath);
      if (content === "") continue;

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (results.matches.length >= maxResults) break;

        regex.lastIndex = 0; // /g regexes are stateful; reset before each test()
        if (regex.test(lines[i])) {
          results.matches.push({
            path: filePath,
            line_number: i + 1,
            line: lines[i],
            before: lines.slice(Math.max(0, i - GREP_CONTEXT_LINES), i),
            after: lines.slice(
              i + 1,
              Math.min(lines.length, i + 1 + GREP_CONTEXT_LINES),
            ),
          });
        }
      }
    }

    return results;
  }

  search(text: string, options?: GrepOptions): GrepResult {
    return this.grep(escapeRegex(text), options);
  }

  mark(
    _path: string,
    _selectedText: string,
    _comment: string,
    _label?: string,
  ): MarkResult {
    throw new Error("Not implemented");
  }

  getMarks(_path?: string): Mark[] {
    throw new Error("Not implemented");
  }

  deleteMark(_markId: string): boolean {
    throw new Error("Not implemented");
  }

  getHistory(path: string): FileVersion[] {
    const listKey = this.#versionsListKey(path);
    const versionIds = this.#adapter.get(listKey) as string[] | undefined;
    if (!versionIds) return [];

    const versions: FileVersion[] = [];
    for (const vid of versionIds) {
      const v = this.#adapter.get(this.#versionKey(path, vid)) as
        | { content: string; timestamp: number }
        | undefined;
      if (v) {
        versions.push({
          version_id: vid,
          timestamp: v.timestamp,
          lines: v.content.split("\n").length,
        });
      }
    }

    return versions.sort((a, b) => a.timestamp - b.timestamp);
  }

  revert(path: string, versionId: string): boolean {
    const v = this.#adapter.get(this.#versionKey(path, versionId)) as
      | { content: string; timestamp: number }
      | undefined;
    if (!v) return false;

    this.#snapshotVersion(path);
    this.#adapter.set(this.#fileKey(path), v.content);
    return true;
  }

  getVersionContent(path: string, versionId: string): string {
    const v = this.#adapter.get(this.#versionKey(path, versionId)) as
      | { content: string; timestamp: number }
      | undefined;
    return v?.content ?? "";
  }

  diff(path: string, versionA: string, versionB?: string): DiffResult {
    const contentA = this.getVersionContent(path, versionA);
    const contentB = versionB
      ? this.getVersionContent(path, versionB)
      : this.#getFile(path);

    return {
      diff: unifiedDiff(contentA, contentB, versionA, versionB ?? "current"),
    };
  }

  #getFile(path: string): string {
    return (this.#adapter.get(this.#fileKey(path)) as string) ?? "";
  }

  #fileKey(path: string): string {
    return `${FILE_PREFIX}${path}`;
  }

  #markKey(id: string): string {
    return `${MARKS_PREFIX}${id}`;
  }

  #saveMark(mark: Mark): void {
    this.#adapter.set(this.#markKey(mark.id), mark);
  }

  #generateMarkId(): string {
    return `mark_${Date.now()}_${++markCounter}`;
  }

  #versionsListKey(path: string): string {
    return `${VERSIONS_PREFIX}${path}:list`;
  }

  #versionKey(path: string, versionId: string): string {
    return `${VERSIONS_PREFIX}${path}:${versionId}`;
  }

  #snapshotVersion(path: string): void {
    const content = this.#getFile(path);
    if (content === "") return;

    const versionId = `${Date.now()}_${++versionCounter}`;
    const listKey = this.#versionsListKey(path);
    const existing = this.#adapter.get(listKey) as string[] | undefined;
    const list = existing ?? [];

    list.push(versionId);
    this.#adapter.set(listKey, list);
    this.#adapter.set(this.#versionKey(path, versionId), {
      content,
      timestamp: Date.now(),
    });
  }
}
