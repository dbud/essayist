// The page's data: SSR embeds it for the browser; the client boot parses it back.
export const pageDataScriptId = "page-data";

// "<" is escaped so the HTML parser cannot end the script tag early.
function serializePageData(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function PageDataScript({ data }: { readonly data: unknown }) {
  return (
    <script
      type="application/json"
      id={pageDataScriptId}
      dangerouslySetInnerHTML={{ __html: serializePageData(data) }}
    />
  );
}
