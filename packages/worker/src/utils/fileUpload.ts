/**
 * Helpers for the file-browser upload flow (the file picker) and binary
 * detection. Binary files are skipped using the same null-byte heuristic
 * git uses.
 */

export interface UploadedFile {
  path: string;
  content: string;
}

export interface DroppedFile {
  path: string;
  file: File;
}

/**
 * Read a File as UTF-8 text. Returns `null` if the file looks binary (a null
 * byte appears in the first 8 KB) -- the same heuristic git uses to decide
 * whether a file is text.
 */
async function readFileAsText(file: File): Promise<string | null> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sampleLen = Math.min(bytes.length, 8192);
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) return null;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Extract {path, file} pairs from a `<input type="file" multiple>` selection.
 * The path is the bare filename (no folder structure).
 */
export function filesFromFileInput(fileList: FileList): DroppedFile[] {
  return Array.from(fileList).map((file) => ({ path: file.name, file }));
}

/**
 * Read a list of {path, file} pairs as text, skipping binaries. Returns the
 * decoded uploads plus the list of skipped paths so the UI can report them.
 */
export async function readFilesAsText(
  files: DroppedFile[],
): Promise<{ uploads: UploadedFile[]; skipped: string[] }> {
  const uploads: UploadedFile[] = [];
  const skipped: string[] = [];
  await Promise.all(
    files.map(async ({ path, file }) => {
      const content = await readFileAsText(file);
      if (content === null) skipped.push(path);
      else uploads.push({ path, content });
    }),
  );
  return { uploads, skipped };
}
