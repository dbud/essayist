import type { PageProps } from "fresh";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en" data-theme="essayist">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Essayist &mdash; AI-powered writing tools</title>
      </head>
      <body class="min-h-screen bg-base-200 text-base-content flex flex-col">
        <nav class="navbar bg-base-100 shadow-sm">
          <div class="navbar-start">
            <a class="btn btn-ghost text-xl">Essayist</a>
          </div>
        </nav>
        <Component />
      </body>
    </html>
  );
}
