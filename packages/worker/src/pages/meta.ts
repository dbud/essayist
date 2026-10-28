// Page conventions: client entry files live under src/client/pages/, one
// per page by file name; a page without one renders server-only. Dev
// serves source paths; the build emits to assets/.

export function clientScriptUrl(page: string): string {
  return import.meta.env.DEV ? `/src/client/pages/${page}.tsx` : `/assets/${page}.js`;
}

export function styleSheetUrl(): string {
  return import.meta.env.DEV ? "/src/client/styles/styles.css" : "/assets/styles.css";
}
