/**
 * The server-side Google Drive integration: export a Doc as markdown via the Drive v3 export
 * endpoint.
 */

import { Effect, Schema } from "effect";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/** The export endpoint returned non-2xx. The status maps callers to
 * specific client responses (401/403 = re-authenticate). */
export class GoogleDriveError extends Schema.TaggedError<GoogleDriveError>()("GoogleDriveError", {
  status: Schema.Number,
  body: Schema.String,
}) {
  override get message() {
    return `the Google Doc export failed (${this.status})`;
  }
}

/** Export a Google Doc as markdown. */
export const exportDocAsMarkdown = (
  accessToken: string,
  docId: string,
): Effect.Effect<string, GoogleDriveError> =>
  Effect.tryPromise({
    try: async () => {
      const url = `${DRIVE_FILES}/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent("text/markdown")}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new GoogleDriveError({
          status: res.status,
          body: await res.text().catch(() => ""),
        });
      }
      return await res.text();
    },
    catch: (cause) =>
      cause instanceof GoogleDriveError
        ? cause
        : new GoogleDriveError({ status: 0, body: String(cause) }),
  });

// Path separators and Windows-invalid chars. Replaced with `-` in titles.
const UNSAFE_TITLE_CHARS = /[\\/:*?"<>|]/g;

/** Turn a Google Doc title into a safe `.md` filename for the VFS. */
export function sanitizeDocTitle(name: string): string {
  const cleaned = name.trim().replace(UNSAFE_TITLE_CHARS, "-");
  if (!cleaned) return "untitled.md";
  return cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
}
