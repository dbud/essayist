// The page registry. The vite config derives the client build's inputs
// from it; the SSR document derives the page's script tag from it.
export const pageNames = ["home"] as const;

export type PageName = (typeof pageNames)[number];

export function clientEntryPath(page: PageName): string {
  return `src/client/pages/${page}.tsx`;
}

export function clientScriptUrl(page: PageName): string {
  return import.meta.env.DEV
    ? `/src/client/pages/${page}.tsx`
    : `/assets/${page}.js`;
}

export function styleSheetUrl(): string {
  return import.meta.env.DEV
    ? "/src/client/styles/styles.css"
    : "/assets/styles.css";
}
