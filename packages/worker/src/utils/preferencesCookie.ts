/**
 * All the preferences travel in a single cookie holding a JSON object. The
 * browser writes it, the server reads it from the request, so the rendered
 * page and the browser start from the same values.
 */

const COOKIE_NAME = "prefs";
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function preferencesCookieName(url: URL): string {
  return url.protocol === "https:" ? `__Host-${COOKIE_NAME}` : COOKIE_NAME;
}

/**
 * Reads the payload from a "name=value; name2=value2" string, the format
 * both the request header and `document.cookie` use. A payload that is not
 * a JSON object reads as empty.
 */
export function readPreferencesCookie(
  source: string | null | undefined,
  url: URL,
): Record<string, unknown> {
  const name = preferencesCookieName(url);
  if (!source) return {};
  for (const part of source.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(part.slice(eq + 1)));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** Writes the payload, replacing the one that was there. */
export function writePreferencesCookie(values: Record<string, unknown>, url: URL): void {
  const parts = [
    `${preferencesCookieName(url)}=${encodeURIComponent(JSON.stringify(values))}`,
    "path=/",
    `max-age=${MAX_AGE_SECONDS}`,
    "samesite=lax",
  ];
  if (url.protocol === "https:") parts.push("secure");
  // biome-ignore lint:suspicious:noDocumentCookie -- we target modern browsers
  document.cookie = parts.join("; ");
}

/** Removes the cookie, so the next request renders the defaults. */
export function clearPreferencesCookie(url: URL): void {
  const parts = ["path=/", "max-age=0"];
  if (url.protocol === "https:") parts.push("secure");
  // biome-ignore lint:suspicious:noDocumentCookie -- we target modern browsers
  document.cookie = `${preferencesCookieName(url)}=; ${parts.join("; ")}`;
}
