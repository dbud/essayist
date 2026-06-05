import type { PageProps } from "fresh";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en" data-theme="cupcake">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>@essayist/web</title>
      </head>
      <body class="min-h-screen bg-base-100 text-base-content">
        <Component />
      </body>
    </html>
  );
}
