import type { RouteConfig } from "fresh";
import GoogleDocImporterPage from "@/islands/GoogleDocImporterPage.tsx";

// Standalone page (no routes/_app wrapper): the Google Picker script lives in
// <head> here so it isn't loaded on every page.
export const config: RouteConfig = { skipAppWrapper: true };

export default function ImportGoogleDocsPage() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Import from Google Docs — Essayist</title>
        <script src="https://apis.google.com/js/api.js" async />
      </head>
      <body class="h-dvh bg-surface text-ink">
        <main class="flex items-center justify-center h-full">
          <GoogleDocImporterPage />
        </main>
      </body>
    </html>
  );
}
