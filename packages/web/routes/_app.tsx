import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import Toaster from "@/islands/Toaster.tsx";
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
        {user && (
          <div class="fixed top-3 right-3 z-50">
            <UserMenu user={user} />
          </div>
        )}
        <Component />
        <Toaster />
      </body>
    </html>
  );
}
