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

export interface VersionPin {
  path: string;
  versionId: string;
}

/**
 * VFS decorator binding one path to one version: reads and marks on the
 * pinned path always target the pinned version; every other operation
 * delegates unchanged.
 */
export class PinnedVFS implements VFS {
  #inner: VFS;
  #pin: VersionPin;

  constructor(inner: VFS, pin: VersionPin) {
    this.#inner = inner;
    this.#pin = pin;
  }

  async read(path: string, options?: ReadOptions): Promise<FileReadResult> {
    if (path !== this.#pin.path) return await this.#inner.read(path, options);
    return await this.#inner.read(path, {
      ...options,
      versionId: this.#pin.versionId,
    });
  }

  async write(path: string, content: string): Promise<WriteResult> {
    return await this.#inner.write(path, content);
  }

  async list(prefix?: string): Promise<FileEntry[]> {
    return await this.#inner.list(prefix);
  }

  async grep(pattern: string, options?: GrepOptions): Promise<GrepResult> {
    return await this.#inner.grep(pattern, options);
  }

  search(text: string, options?: GrepOptions): Promise<GrepResult> {
    return this.#inner.search(text, options);
  }

  async mark(
    path: string,
    selectedText: string,
    comment: string,
    options?: MarkOptions,
  ): Promise<MarkResult> {
    if (path !== this.#pin.path) {
      return await this.#inner.mark(path, selectedText, comment, options);
    }
    return await this.#inner.mark(path, selectedText, comment, {
      ...options,
      versionId: this.#pin.versionId,
    });
  }

  async getMarks(path: string, versionId: string): Promise<Mark[]> {
    return await this.#inner.getMarks(path, versionId);
  }

  async deleteMark(
    path: string,
    versionId: string,
    markId: string,
  ): Promise<boolean> {
    return await this.#inner.deleteMark(path, versionId, markId);
  }

  async getHistory(path: string): Promise<FileVersion[]> {
    return await this.#inner.getHistory(path);
  }

  async revert(path: string, versionId: string): Promise<boolean> {
    return await this.#inner.revert(path, versionId);
  }

  async diff(
    path: string,
    versionA: string,
    versionB: string,
  ): Promise<DiffResult> {
    return await this.#inner.diff(path, versionA, versionB);
  }
}
