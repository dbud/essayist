import { unifiedDiff } from "@/vfs/unified_diff.ts";
import type { PersistenceAdapter } from "./persistence.ts";
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
} from "./types.ts";
import { FileSnapshot } from "@essayist/core";

const FILE_LATEST_PREFIX = "file:latest:";
const FILE_VERSIONS_PREFIX = "file:versions:";
const FILE_CONTENT_PREFIX = "file:content:";
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
    { versionId, startLine, endLine, numbered }: ReadOptions = {},
  ): FileReadResult {
    let snapshot: FileSnapshot = {
      content: "",
      version_id: versionId ?? "",
      timestamp: 0,
      lines: 0,
    };
    if (versionId) {
      snapshot = {
        ...snapshot,
        ...this.#getVersion(path, versionId),
        content: this.#getVersionContent(path, versionId),
      };
    } else {
      snapshot = { ...snapshot, ...this.#getFile(path) };
    }

    const start = Math.max(1, startLine ?? 1);
    const end = Math.min(snapshot.lines, endLine ?? snapshot.lines);
    let selectedLines = snapshot.content.split("\n").slice(start - 1, end);

    if (numbered) {
      selectedLines = selectedLines.map(
        (line, i) => `${String(start + i).padStart(6)}: ${line}`,
      );
    }

    return {
      ...snapshot,
      content: selectedLines.join("\n"),
      start_line: start,
      end_line: end,
    };
  }

  write(path: string, content: string): WriteResult {
    const timestamp = Date.now();
    const lines = content.split("\n").length;
    const versionId = `${timestamp}_${++versionCounter}`;
    const version: FileVersion = {
      version_id: versionId,
      timestamp,
      lines,
    };
    const versionsKey = this.#versionsKey(path);
    const versions = this.#adapter.get(versionsKey) as
      | FileVersion[]
      | undefined ?? [];
    versions.push(version);
    this.#adapter.set(versionsKey, versions);
    this.#adapter.set(this.#contentKey(path, versionId), content);
    this.#adapter.set(
      this.#latestKey(path),
      { content, ...version } as FileSnapshot,
    );

    return {
      path,
      lines,
      created: versions.length === 1,
    };
  }

  list(prefix?: string): FileEntry[] {
    const searchPrefix = FILE_LATEST_PREFIX + (prefix ?? "");

    const entries: FileEntry[] = [];

    const iter = this.#adapter.list(searchPrefix);

    if (Symbol.iterator in iter) {
      for (const key of iter as Iterable<string>) {
        const path = key.slice(FILE_LATEST_PREFIX.length);
        const latest = this.#getFile(path);
        if (latest) {
          entries.push({
            path,
            lines: latest.lines,
          });
        }
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
    const files = this.list(path).map((f) => f.path);

    for (const filePath of files) {
      if (results.matches.length >= maxResults) break;

      const latest = this.#getFile(filePath);
      if (!latest) continue;
      const content = latest.content;
      if (content === "") continue;

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (results.matches.length >= maxResults) break;

        regex.lastIndex = 0;
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
    _versionId: string,
    _selectedText: string,
    _comment: string,
    _label?: string,
  ): MarkResult {
    throw new Error("Not implemented");
  }

  getMarks(_path: string, _versionId: string): Mark[] {
    throw new Error("Not implemented");
  }

  deleteMark(_markId: string): boolean {
    throw new Error("Not implemented");
  }

  getHistory(path: string): FileVersion[] {
    const versions = this.#adapter.get(this.#versionsKey(path)) as
      | FileVersion[]
      | undefined ?? [];
    return versions.sort((a, b) => a.timestamp - b.timestamp);
  }

  revert(path: string, versionId: string): boolean {
    const content = this.#getVersionContent(path, versionId);
    if (content === "") return false;

    this.write(path, content);
    return true;
  }

  diff(path: string, versionA: string, versionB: string): DiffResult {
    const contentA = this.#getVersionContent(path, versionA);
    const contentB = this.#getVersionContent(path, versionB);

    return {
      diff: unifiedDiff(contentA, contentB, versionA, versionB),
    };
  }

  #getFile(path: string): FileSnapshot | undefined {
    return this.#adapter.get(this.#latestKey(path)) as
      | FileSnapshot
      | undefined;
  }

  #getVersion(path: string, versionId: string): FileVersion | undefined {
    const versions = this.#adapter.get(this.#versionsKey(path)) as
      | FileVersion[]
      | undefined ?? [];
    return versions.find((version) => version.version_id === versionId);
  }

  #getVersionContent(path: string, versionId: string): string {
    return (this.#adapter.get(this.#contentKey(path, versionId)) as string) ??
      "";
  }

  #latestKey(path: string): string {
    return `${FILE_LATEST_PREFIX}${path}`;
  }

  #contentKey(path: string, versionId: string): string {
    return `${FILE_CONTENT_PREFIX}${path}:${versionId}`;
  }

  #versionsKey(path: string): string {
    return `${FILE_VERSIONS_PREFIX}${path}`;
  }

  #markKey(id: string): string {
    return `${MARKS_PREFIX}${id}`;
  }

  #marksListKey(path: string, versionId: string): string {
    return `${MARKS_PREFIX}list:${path}:${versionId}`;
  }

  #saveMark(mark: Mark): void {
    this.#adapter.set(this.#markKey(mark.id), mark);

    const listKey = this.#marksListKey(mark.path, mark.version_id);
    const list = this.#adapter.get(listKey) as string[] | undefined ?? [];
    list.push(mark.id);
    this.#adapter.set(listKey, list);
  }

  #saveMarks(path: string, versionId: string, marks: Mark[]): void {
    const list: string[] = [];
    for (const mark of marks) {
      this.#adapter.set(this.#markKey(mark.id), mark);
      list.push(mark.id);
    }
    const listKey = this.#marksListKey(path, versionId);
    this.#adapter.set(listKey, list);
  }

  #generateMarkId(): string {
    return `mark_${Date.now()}_${++markCounter}`;
  }
}
