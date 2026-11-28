// The path of the editor URL: /editor/<workspace>/<file path>. Each segment of the file path is
// encoded on its own, so the slashes between folders stay readable.

const PREFIX = "/editor";

/** The path that opens a file of a workspace, or the workspace alone without a file. */
export function editorPath(ws: string | null, path: string | null): string {
  if (ws === null) return PREFIX;
  const base = `${PREFIX}/${encodeURIComponent(ws)}`;
  return path === null ? base : `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The workspace and the file path an editor URL names; null for a part it leaves out. */
export function parseEditorPath(pathname: string): { ws: string | null; path: string | null } {
  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return { ws: null, path: null };
  const [ws = "", ...segments] = pathname.slice(PREFIX.length + 1).split("/");
  try {
    return {
      ws: ws === "" ? null : decodeURIComponent(ws),
      path: segments.length === 0 ? null : segments.map(decodeURIComponent).join("/") || null,
    };
  } catch {
    // a malformed escape names nothing
    return { ws: null, path: null };
  }
}
