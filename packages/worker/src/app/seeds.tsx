// The seed scripts: SSR embeds them in the document, boot parses them back.

export const PAGE_DATA_SCRIPT_ID = "page-data";
export const APP_STATE_SCRIPT_ID = "app-state";

// "<" is escaped so the HTML parser cannot end the script tag early.
function serializeSeed(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function PageDataScript({ data }: { readonly data: unknown }) {
  return (
    <script
      type="application/json"
      id={PAGE_DATA_SCRIPT_ID}
      dangerouslySetInnerHTML={{ __html: serializeSeed(data) }}
    />
  );
}

export function AppStateScript({ state }: { readonly state: unknown }) {
  return (
    <script
      type="application/json"
      id={APP_STATE_SCRIPT_ID}
      dangerouslySetInnerHTML={{ __html: serializeSeed(state) }}
    />
  );
}
