import type { PageProps } from "fresh";
import { Partial } from "fresh/runtime";
import { PillClipDefs } from "@/components/ui/PillClipDefs.tsx";
import type { State } from "@/define.ts";
import Toaster from "@/islands/Toaster.tsx";
import Tooltip from "@/islands/Tooltip.tsx";

export default function App({ Component }: PageProps<unknown, State>) {
  return (
    // f-client-nav opts the app into Fresh's client-side navigation. Navigations
    // are resolved as partial swaps: the page content lives in a <Partial> below,
    // so switching routes swaps that region in place instead of reloading.
    <html lang="en" f-client-nav>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Essayist &mdash; AI-powered writing tools</title>
      </head>
      <body class="h-dvh flex flex-col">
        <PillClipDefs />
        <Partial name="page">
          <Component />
        </Partial>
        <Toaster />
        <Tooltip />
      </body>
    </html>
  );
}
