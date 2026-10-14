import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";

// Prototype shell only. Head extras (tailwind css link, client script tags)
// arrive with the first real feature port and the assets slice.
const baseCss = `
body { margin: 0 auto; max-width: 42rem; padding: 2rem 1.25rem; font-family: system-ui, sans-serif; }
h1 { font-size: 1.6rem; }
`;

export interface DocumentProps {
  readonly title: string;
  readonly children?: ComponentChildren;
}

export function Document({ title, children }: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{baseCss}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

export function renderDocument(title: string, page: ComponentChildren): string {
  return `<!doctype html>${render(<Document title={title}>{page}</Document>)}`;
}
