import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";

// The client bundle exists in both modes under different URLs: the dev
// transform serves it at its source path; the build emits it at assets/.
const clientScript = import.meta.env.DEV
  ? "/src/client/main.tsx"
  : "/assets/app.js";

function serializePageData(data: unknown): string {
  // "<" is escaped so the HTML parser cannot end a script tag early.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface DocumentProps {
  readonly title: string;
  readonly client?: string;
  readonly pageData?: unknown;
  readonly children?: ComponentChildren;
}

export function Document({ title, client, pageData, children }: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{`
body { margin: 0 auto; max-width: 42rem; padding: 2rem 1.25rem; font-family: system-ui, sans-serif; }
h1 { font-size: 1.6rem; }
`}</style>
        {pageData !== undefined ? (
          <script
            type="application/json"
            id="page-data"
            dangerouslySetInnerHTML={{ __html: serializePageData(pageData) }}
          />
        ) : null}
        <script type="module" src={clientScript} />
      </head>
      <body data-client={client}>{children}</body>
    </html>
  );
}

export function renderDocument(
  title: string,
  page: ComponentChildren,
  options?: { readonly client?: string; readonly pageData?: unknown },
): string {
  return `<!doctype html>${render(
    <Document
      title={title}
      client={options?.client}
      pageData={options?.pageData}
    >
      {page}
    </Document>,
  )}`;
}
