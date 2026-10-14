import type { ComponentChildren } from "preact";
import { render } from "preact-render-to-string";
import { PageDataScript } from "./pageData";
import { clientScriptUrl, type PageName, styleSheetUrl } from "./pages";

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
        <link rel="stylesheet" href={styleSheetUrl()} />
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
