import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import ClearCache from "@/islands/ClearCache.tsx";

export default function App({ Component, state }: PageProps<unknown, State>) {
  const user = state.user;
  return (
    <html lang="en" data-theme="essayist">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Essayist &mdash; AI-powered writing tools</title>
      </head>
      <body class="h-dvh bg-base-200 text-base-content flex flex-col">
        <nav class="navbar bg-base-100 shadow-sm z-10">
          <div class="navbar-start">
            <a href="/" class="btn btn-ghost text-xl">
              Essayist
            </a>
          </div>
          <div class="navbar-end gap-2">
            {user && (
              <span class="hidden sm:inline text-sm text-base-content/60">
                {user.email}
              </span>
            )}
            <a href="/oauth/signout" class="btn btn-ghost btn-sm">
              Sign out
            </a>
            <ClearCache />
          </div>
        </nav>
        <Component />
      </body>
    </html>
  );
}
