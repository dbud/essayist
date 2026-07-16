import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import UserMenu from "@/islands/UserMenu.tsx";

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
          <div class="navbar-start"></div>
          <div class="navbar-center">
            <a
              href="/"
              class="text-2xl font-serif italic tracking-widest font-light"
            >
              essayist
            </a>
          </div>
          <div class="navbar-end">{user && <UserMenu user={user} />}</div>
        </nav>
        <Component />
      </body>
    </html>
  );
}
