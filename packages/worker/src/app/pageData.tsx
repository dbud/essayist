// The page's data: SSR embeds it for the browser; the client boot parses it back.
export const PAGE_DATA_SCRIPT_ID = "page-data";

// "<" is escaped so the HTML parser cannot end the script tag early.
function serializePageData(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function PageDataScript({ data }: { readonly data: unknown }) {
  return (
    <script
      type="application/json"
      id={PAGE_DATA_SCRIPT_ID}
      dangerouslySetInnerHTML={{ __html: serializePageData(data) }}
    />
  );
}
