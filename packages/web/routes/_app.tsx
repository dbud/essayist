import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import Toaster from "@/islands/Toaster.tsx";
import Tooltip from "@/islands/Tooltip.tsx";

export default function App({ Component }: PageProps<unknown, State>) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Essayist</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body class="h-dvh flex flex-col">
        <Component />
        <Toaster />
        <Tooltip />
      </body>
    </html>
  );
}
