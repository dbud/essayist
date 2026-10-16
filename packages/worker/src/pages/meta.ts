// Page build conventions: the export map keys in pages/index.ts name a
// client entry file under src/client/pages/; a page without one renders
// server-only. Dev serves source paths; the build emits to assets/.

export function clientScriptUrl(page: string): string {
  return import.meta.env.DEV
    ? `/src/client/pages/${page}.tsx`
    : `/assets/${page}.js`;
}

export function styleSheetUrl(): string {
  return import.meta.env.DEV
    ? "/src/client/styles/styles.css"
    : "/assets/styles.css";
}
