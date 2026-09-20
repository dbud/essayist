// deno-lint-ignore-file react-no-danger -- the head script is static and
// first-party; it must run before first paint.
import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import Toaster from "@/islands/Toaster.tsx";
import Tooltip from "@/islands/Tooltip.tsx";
import { FONT_AXIS_KEYS } from "@/signals/fonts.ts";

// apply persisted font axes before first paint
const fontAxisScript = `for (const key of ${JSON.stringify(FONT_AXIS_KEYS)}) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "");
    if (typeof value === "string" && value) {
      document.documentElement.dataset[key] = value;
    }
  } catch {
    // absent or unparsable entry: keep the SSR default
  }
}`;

export default function App({ Component }: PageProps<unknown, State>) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script dangerouslySetInnerHTML={{ __html: fontAxisScript }} />
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
