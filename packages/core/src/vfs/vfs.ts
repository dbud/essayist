import type { FileSnapshot } from "@essayist/core";
import { resolveMarks } from "@/vfs/marks_resolver.ts";
import { TokenizedText } from "@/vfs/text_search.ts";
import { unifiedDiff } from "@/vfs/unified_diff.ts";
import {
  ConcurrentModificationError,
  type Key,
  type PersistenceAdapter,
  type WriteOp,
} from "./persistence.ts";
import type {
  DiffResult,
  FileEntry,
  FileReadResult,
  FileVersion,
  GrepOptions,
  GrepResult,
  Mark,
  MarkOptions,
  MarkResult,
  ReadOptions,
  VFS,
  WriteResult,
} from "./types.ts";

const DEFAULT_CONTEXT_SPAN = 60;

const FILE_LATEST = "file:latest";
const FILE_VERSIONS = "file:versions";
const FILE_CONTENT = "file:content";
const MARKS = "marks";
const WORKSPACES = "ws";
const GREP_CONTEXT_LINES = 2;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let markCounter = 0;
let versionCounter = 0;

export class VirtualFileSystem implements VFS {
  #adapter: PersistenceAdapter;
  #workspaceId: string;

  /**
   * @param adapter      Backing key/value store.
   * @param workspaceId  All file/mark keys are scoped under `["ws", workspaceId, ...]`,
   *   so multiple workspaces can share one adapter without colliding.
   */
  constructor(adapter: PersistenceAdapter, workspaceId: string) {
    this.#adapter = adapter;
    this.#workspaceId = workspaceId;
  }

  async read(
    path: string,
    { versionId, startLine, endLine, numbered }: ReadOptions = {},
  ): Promise<FileReadResult> {
    let snapshot: FileSnapshot = {
      content: "",
      version_id: versionId ?? "",
      timestamp: 0,
      lines: 0,
    };
    if (versionId) {
      const [version, content] = await Promise.all([
        this.#getVersion(path, versionId),
        this.#getVersionContent(path, versionId),
      ]);
      snapshot = { ...snapshot, ...version, content };
    } else {
      snapshot = { ...snapshot, ...(await this.#getFile(path)) };
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

  // deno-lint-ignore require-await
  async write(path: string, content: string): Promise<WriteResult> {
    return this.#retry(() => this.#writeAttempt(path, content));
  }

  async #writeAttempt(path: string, content: string): Promise<WriteResult> {
    const timestamp = Date.now();
    const lines = content.split("\n").length;
    const versionId = `${timestamp}_${++versionCounter}`;
    const version: FileVersion = {
      version_id: versionId,
      timestamp,
      lines,
    };
    const versionsKey = this.#versionsKey(path);
    const versionsEntry = await this.#adapter.get<FileVersion[]>(versionsKey);
    const versions = versionsEntry?.value ?? [];

    const previousVersionId =
      versions.length > 0
        ? versions[versions.length - 1].version_id
        : undefined;
    const oldContent = previousVersionId
      ? await this.#getVersionContent(path, previousVersionId)
      : "";

    const ops: WriteOp[] = [
      { type: "set", key: versionsKey, value: [...versions, version] },
      { type: "set", key: this.#contentKey(path, versionId), value: content },
      {
        type: "set",
        key: this.#latestKey(path),
        value: { content, ...version } as FileSnapshot,
      },
    ];

    // Migrate marks from the previous version into the new version.
    if (previousVersionId) {
      const oldMarks = await this.#getMarksList(path, previousVersionId);
      if (oldMarks.length > 0) {
        const newMarks = resolveMarks({
          marks: oldMarks,
          oldContent,
          newContent: content,
        });
        ops.push({
          type: "set",
          key: this.#marksKey(path, versionId),
          value: newMarks,
        });
      }
    }

    // Guard against a concurrent write to the same file: if the versions list
    // changed since we read it, the whole batch is rejected and retried.
    await this.#adapter.batch(ops, {
      checks: [
        {
          key: versionsKey,
          versionstamp: versionsEntry?.versionstamp ?? null,
        },
      ],
    });

    return {
      path,
      lines,
      created: versions.length === 0,
    };
  }

  async list(prefix?: string): Promise<FileEntry[]> {
    const { entries } = await this.#adapter.list<FileSnapshot>([
      WORKSPACES,
      this.#workspaceId,
      FILE_LATEST,
    ]);
    const result: FileEntry[] = [];
    for (const entry of entries) {
      const path = String(entry.key[entry.key.length - 1]);
      if (prefix !== undefined && !path.startsWith(prefix)) continue;
      const latest = entry.value;
      if (latest) result.push({ path, lines: latest.lines });
    }
    result.sort((a, b) => a.path.localeCompare(b.path));
    return result;
  }

  async grep(pattern: string, options?: GrepOptions): Promise<GrepResult> {
    const { path, caseSensitive = false, maxResults = 50 } = options ?? {};
    const flags = caseSensitive ? "g" : "gi";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      regex = new RegExp(escapeRegex(pattern), flags);
    }

    const results: GrepResult = { matches: [] };
    const files = await this.list(path);

    for (const file of files) {
      if (results.matches.length >= maxResults) break;

      const latest = await this.#getFile(file.path);
      if (!latest) continue;
      const content = latest.content;
      if (content === "") continue;

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (results.matches.length >= maxResults) break;

        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          results.matches.push({
            path: file.path,
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

  search(text: string, options?: GrepOptions): Promise<GrepResult> {
    return this.grep(escapeRegex(text), options);
  }

  async mark(
    path: string,
    selectedText: string,
    comment: string,
    {
      label,
      lineHint,
      threadId,
      contextSpan = DEFAULT_CONTEXT_SPAN,
    }: MarkOptions = {},
  ): Promise<MarkResult> {
    const latest = await this.#getFile(path);
    if (!latest) {
      return { mark_id: "", thread_id: "", marked: false };
    }
    const { content, version_id } = latest;
    const offsetHint =
      lineHint !== undefined ? lineToOffset(content, lineHint) : 0;
    const tt = new TokenizedText(content);
    const offset = tt.findExactNear(selectedText, offsetHint);
    if (offset === null) {
      return { mark_id: "", thread_id: "", marked: false };
    }

    const beforeContext = tt.captureBeforeContext(offset, contextSpan);
    const afterContext = tt.captureAfterContext(
      offset + selectedText.length,
      contextSpan,
    );

    const mark: Mark = {
      id: this.#generateMarkId(),
      thread_id: threadId ?? this.#generateMarkId(),
      path,
      version_id,
      selected_text: selectedText,
      before_context: beforeContext,
      after_context: afterContext,
      comment,
      label,
      created_at: Date.now(),
      offset,
      length: selectedText.length,
      status: "resolved",
    };

    await this.#saveMark(mark);

    return {
      mark_id: mark.id,
      thread_id: mark.thread_id,
      marked: true,
    };
  }

  async getMarks(path: string, versionId: string): Promise<Mark[]> {
    return await this.#getMarksList(path, versionId);
  }

  // deno-lint-ignore require-await
  async deleteMark(
    path: string,
    versionId: string,
    markId: string,
  ): Promise<boolean> {
    return this.#retry(() => this.#deleteMarkAttempt(path, versionId, markId));
  }

  async #deleteMarkAttempt(
    path: string,
    versionId: string,
    markId: string,
  ): Promise<boolean> {
    const key = this.#marksKey(path, versionId);
    const entry = await this.#adapter.get<Mark[]>(key);
    const marks = entry?.value ?? [];
    const filtered = marks.filter((m) => m.id !== markId);
    if (filtered.length === marks.length) return false;
    await this.#adapter.batch([{ type: "set", key, value: filtered }], {
      checks: [{ key, versionstamp: entry?.versionstamp ?? null }],
    });
    return true;
  }

  async getHistory(path: string): Promise<FileVersion[]> {
    const versions =
      (await this.#adapter.get<FileVersion[]>(this.#versionsKey(path)))
        ?.value ?? [];
    return versions.sort((a, b) => a.timestamp - b.timestamp);
  }

  async revert(path: string, versionId: string): Promise<boolean> {
    const content = await this.#getVersionContent(path, versionId);
    if (content === "") return false;

    await this.write(path, content);
    return true;
  }

  async diff(
    path: string,
    versionA: string,
    versionB: string,
  ): Promise<DiffResult> {
    const [contentA, contentB] = await Promise.all([
      this.#getVersionContent(path, versionA),
      this.#getVersionContent(path, versionB),
    ]);

    return {
      diff: unifiedDiff(contentA, contentB, versionA, versionB),
    };
  }

  async #getFile(path: string): Promise<FileSnapshot | undefined> {
    return (await this.#adapter.get<FileSnapshot>(this.#latestKey(path)))
      ?.value;
  }

  async #getVersion(
    path: string,
    versionId: string,
  ): Promise<FileVersion | undefined> {
    const versions =
      (await this.#adapter.get<FileVersion[]>(this.#versionsKey(path)))
        ?.value ?? [];
    return versions.find((version) => version.version_id === versionId);
  }

  async #getVersionContent(path: string, versionId: string): Promise<string> {
    return (
      (await this.#adapter.get<string>(this.#contentKey(path, versionId)))
        ?.value ?? ""
    );
  }

  #latestKey(path: string): Key {
    return [WORKSPACES, this.#workspaceId, FILE_LATEST, path];
  }

  #contentKey(path: string, versionId: string): Key {
    return [WORKSPACES, this.#workspaceId, FILE_CONTENT, path, versionId];
  }

  #versionsKey(path: string): Key {
    return [WORKSPACES, this.#workspaceId, FILE_VERSIONS, path];
  }

  #marksKey(path: string, versionId: string): Key {
    return [WORKSPACES, this.#workspaceId, MARKS, path, versionId];
  }

  // deno-lint-ignore require-await
  async #saveMark(mark: Mark): Promise<void> {
    return this.#retry(() => this.#saveMarkAttempt(mark));
  }

  async #saveMarkAttempt(mark: Mark): Promise<void> {
    const key = this.#marksKey(mark.path, mark.version_id);
    const entry = await this.#adapter.get<Mark[]>(key);
    const marks = entry?.value ?? [];
    await this.#adapter.batch([{ type: "set", key, value: [...marks, mark] }], {
      checks: [{ key, versionstamp: entry?.versionstamp ?? null }],
    });
  }

  /** Retry an optimistic-concurrency attempt on ConcurrentModificationError. */
  async #retry<T>(fn: () => Promise<T>, maxAttempts = 10): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (
          !(error instanceof ConcurrentModificationError) ||
          attempt >= maxAttempts
        ) {
          throw error;
        }
      }
    }
  }

  #generateMarkId(): string {
    return `mark_${Date.now()}_${++markCounter}`;
  }

  async #getMarksList(path: string, versionId: string): Promise<Mark[]> {
    return (
      (await this.#adapter.get<Mark[]>(this.#marksKey(path, versionId)))
        ?.value ?? []
    );
  }
}

/** Convert a 1-based line number to a character offset into the content. */
function lineToOffset(content: string, line: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < content.length) {
    const nl = content.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
    currentLine++;
  }
  return offset;
}
