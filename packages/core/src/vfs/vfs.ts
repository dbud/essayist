import type { FileSnapshot } from "@essayist/core";
import { resolveMarks } from "@/vfs/marks_resolver.ts";
import { TokenizedText } from "@/vfs/text_search.ts";
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
  MarkOptions,
  MarkResult,
  ReadOptions,
  VFS,
  WriteResult,
} from "./types.ts";

const DEFAULT_CONTEXT_RADIUS = 60;

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

  async write(path: string, content: string): Promise<WriteResult> {
    const timestamp = Date.now();
    const lines = content.split("\n").length;
    const versionId = `${timestamp}_${++versionCounter}`;
    const version: FileVersion = {
      version_id: versionId,
      timestamp,
      lines,
    };
    const versionsKey = this.#versionsKey(path);
    const versions =
      ((await this.#adapter.get(versionsKey)) as FileVersion[] | undefined) ??
      [];

    const previousVersionId =
      versions.length > 0
        ? versions[versions.length - 1].version_id
        : undefined;
    const oldContent = previousVersionId
      ? await this.#getVersionContent(path, previousVersionId)
      : "";

    versions.push(version);
    await Promise.all([
      this.#adapter.set(versionsKey, versions),
      this.#adapter.set(this.#contentKey(path, versionId), content),
      this.#adapter.set(this.#latestKey(path), {
        content,
        ...version,
      } as FileSnapshot),
    ]);

    if (previousVersionId) {
      const oldMarks = await this.#getMarksList(path, previousVersionId);
      if (oldMarks.length > 0) {
        const newMarks = resolveMarks({
          marks: oldMarks,
          oldContent,
          newContent: content,
        });
        await this.#saveMarks(path, versionId, newMarks);
      }
    }

    return {
      path,
      lines,
      created: versions.length === 1,
    };
  }

  async list(prefix?: string): Promise<FileEntry[]> {
    const searchPrefix = FILE_LATEST_PREFIX + (prefix ?? "");
    const entries: FileEntry[] = [];

    for await (const key of this.#adapter.list(searchPrefix)) {
      const path = key.slice(FILE_LATEST_PREFIX.length);
      const latest = await this.#getFile(path);
      if (latest) {
        entries.push({ path, lines: latest.lines });
      }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    return entries;
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
      contextRadius = DEFAULT_CONTEXT_RADIUS,
    }: MarkOptions = {},
  ): Promise<MarkResult> {
    const latest = await this.#getFile(path);
    if (!latest) {
      return { mark_id: "", thread_id: "", marked: false };
    }
    const { content, version_id } = latest;
    const offsetHint =
      lineHint !== undefined ? lineToOffset(content, lineHint) : 0;
    const offset = new TokenizedText(content).findExactNear(
      selectedText,
      offsetHint,
    );
    if (offset === null) {
      return { mark_id: "", thread_id: "", marked: false };
    }

    const beforeContext = content.slice(
      Math.max(0, offset - contextRadius),
      offset,
    );
    const afterContext = content.slice(
      offset + selectedText.length,
      offset + selectedText.length + contextRadius,
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

  async deleteMark(
    path: string,
    versionId: string,
    markId: string,
  ): Promise<boolean> {
    const key = this.#marksKey(path, versionId);
    const marks = await this.#getMarksList(path, versionId);
    const filtered = marks.filter((m) => m.id !== markId);
    if (filtered.length === marks.length) return false;
    await this.#adapter.set(key, filtered);
    return true;
  }

  async getHistory(path: string): Promise<FileVersion[]> {
    const versions =
      ((await this.#adapter.get(this.#versionsKey(path))) as
        | FileVersion[]
        | undefined) ?? [];
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
    return (await this.#adapter.get(this.#latestKey(path))) as
      | FileSnapshot
      | undefined;
  }

  async #getVersion(
    path: string,
    versionId: string,
  ): Promise<FileVersion | undefined> {
    const versions =
      ((await this.#adapter.get(this.#versionsKey(path))) as
        | FileVersion[]
        | undefined) ?? [];
    return versions.find((version) => version.version_id === versionId);
  }

  async #getVersionContent(path: string, versionId: string): Promise<string> {
    return (
      ((await this.#adapter.get(
        this.#contentKey(path, versionId),
      )) as string) ?? ""
    );
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

  #marksKey(path: string, versionId: string): string {
    return `${MARKS_PREFIX}${path}:${versionId}`;
  }

  async #saveMark(mark: Mark): Promise<void> {
    const marks = await this.#getMarksList(mark.path, mark.version_id);
    marks.push(mark);
    await this.#adapter.set(this.#marksKey(mark.path, mark.version_id), marks);
  }

  async #saveMarks(
    path: string,
    versionId: string,
    marks: Mark[],
  ): Promise<void> {
    await this.#adapter.set(this.#marksKey(path, versionId), marks);
  }

  #generateMarkId(): string {
    return `mark_${Date.now()}_${++markCounter}`;
  }

  async #getMarksList(path: string, versionId: string): Promise<Mark[]> {
    return (
      ((await this.#adapter.get(this.#marksKey(path, versionId))) as
        | Mark[]
        | undefined) ?? []
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
