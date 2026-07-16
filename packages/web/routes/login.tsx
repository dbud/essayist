/**
 * Sign-in landing page. Shown to unauthenticated browser users (the auth
 * middleware redirects them here). A single call-to-action kicks off the
 * Google OAuth flow at /oauth/signin.
 */
export default function LoginPage() {
  return (
    <main class="flex-1 flex items-start justify-center p-4">
      <div class="card bg-base-100 shadow w-full max-w-sm">
        <div class="card-body text-center gap-4">
          <p class="text-base-content/60">
            Sign in with your Google account to continue.
          </p>
          <a href="/oauth/signin" class="btn btn-primary w-full">
            Sign in with Google
          </a>
        </div>
      </div>
    </main>
  );
}
