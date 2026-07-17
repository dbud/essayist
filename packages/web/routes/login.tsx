import type { PageProps } from "fresh";

/**
 * Returns a safe same-origin path to redirect to after sign-in, or `/` if the
 * given value is missing or unsafe. Rejects protocol-relative URLs (`//...`),
 * the login page itself, and OAuth routes (avoids post-login redirect loops).
 */
function safeNext(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/";
  if (next === "/login" || next.startsWith("/oauth/")) return "/";
  return next;
}

/**
 * Sign-in landing page. Shown to unauthenticated browser users (the auth
 * middleware redirects them here with a `next` query param). The button starts
 * the Google OAuth flow and passes `next` as `success_url` so
 * `@deno/kv-oauth` sends the user back to the page they originally requested
 * instead of falling back to the `/login` referer.
 */
export default function LoginPage({ url }: PageProps) {
  const next = safeNext(url.searchParams.get("next"));
  const href = `/oauth/signin?success_url=${encodeURIComponent(next)}`;
  return (
    <main class="flex-1 flex items-start justify-center p-4">
      <div class="card bg-base-100 shadow w-full max-w-sm">
        <div class="card-body text-center gap-4">
          <p class="text-base-content/60">
            Sign in with your Google account to continue.
          </p>
          <a href={href} class="btn btn-primary w-full">
            Sign in with Google
          </a>
        </div>
      </div>
    </main>
  );
}
