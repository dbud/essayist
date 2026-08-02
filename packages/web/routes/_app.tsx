import type { PageProps } from "fresh";
import { PillClipDefs } from "@/components/ui/PillClipDefs.tsx";
import type { State } from "@/define.ts";
import Toaster from "@/islands/Toaster.tsx";

// UserMenu temporarily disabled: unstyled after the daisyUI removal.
// import UserMenu from "@/islands/UserMenu.tsx";

export default function App({ Component }: PageProps<unknown, State>) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Essayist &mdash; AI-powered writing tools</title>
      </head>
      <body class="h-dvh bg-base-200 text-base-content flex flex-col">
        <PillClipDefs />
        <Component />
        <Toaster />
      </body>
    </html>
  );
}
