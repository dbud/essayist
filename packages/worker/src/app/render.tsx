import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";
import { PageDataScript } from "./pageData";
import { clientScriptUrl, type PageName } from "./pages";

export interface DocumentProps {
  readonly title: string;
  readonly client?: PageName;
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
        {pageData !== undefined ? <PageDataScript data={pageData} /> : null}
        {client !== undefined ? (
          <script type="module" src={clientScriptUrl(client)} />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}

export function renderDocument(
  title: string,
  page: ComponentChildren,
  options?: { readonly client?: PageName; readonly pageData?: unknown },
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
