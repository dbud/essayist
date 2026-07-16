/**
 * Sign-in landing page. Shown to unauthenticated browser users (the auth
 * middleware redirects them here). A single call-to-action kicks off the
 * Google OAuth flow at /oauth/signin.
 */
export default function LoginPage() {
  return (
    <main class="flex-1 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-md w-full max-w-sm">
        <div class="card-body items-center text-center gap-4">
          <h1 class="card-title text-2xl">Welcome to Essayist</h1>
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
