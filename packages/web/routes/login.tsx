import type { PageProps } from "fresh";
import { ArrowUpRight } from "lucide-preact";

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
    <main class="flex items-start bg-surface h-full">
      <div class="flex flex-col stack w-1/2 max-w-128">
        <p class="text-ink bg-surface h-20 p-4 w-full">
          Sign in with your Google account to continue.
        </p>
        <a href={href} class="btn cell--accent self-end">
          <ArrowUpRight size={16} />
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
