const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

// Raised when Google's export endpoint returns non-2xx. Carries the status so
// the import route can map 401/403/404 to a specific client response.
export class GoogleDriveError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`google drive export failed: ${status}`);
    this.name = "GoogleDriveError";
  }
}

/** Export a Google Doc as markdown via the Drive v3 export endpoint. */
export async function exportDocAsMarkdown(
  accessToken: string,
  docId: string,
): Promise<string> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent(
    "text/markdown",
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new GoogleDriveError(res.status, await res.text().catch(() => ""));
  }
  return await res.text();
}

// Path separators and Windows-invalid chars. Replaced with `-` in titles.
const UNSAFE_TITLE_CHARS = /[\\/:*?"<>|]/g;

/** Turn a Google Doc title into a safe `.md` filename for the VFS. */
export function sanitizeDocTitle(name: string): string {
  const cleaned = name.trim().replace(UNSAFE_TITLE_CHARS, "-");
  if (!cleaned) return "untitled.md";
  return cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
}
