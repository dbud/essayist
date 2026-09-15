/**
 * Returns a safe same-origin path to redirect to after sign-in, or `/` if the
 * given value is missing or unsafe. Rejects protocol-relative URLs (`//...`),
 * the login page itself, and OAuth routes (avoids post-login redirect loops).
 */
export function safeNext(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/";
  if (next === "/login" || next.startsWith("/oauth/")) return "/";
  return next;
}
