import type { ComponentChild } from "preact";
import { hydrate } from "preact";
import { pageDataScriptId } from "@/app/pageData";

// One boot for every client page. Data and Models infer from the page's
// model factory; tree must accept those models, so drift fails tsc here.
export interface PageBoot<Data, Models> {
  readonly models: (data: Data) => Models;
  readonly tree: (models: Models) => ComponentChild;
}

export async function boot<Data, Models>(
  page: PageBoot<Data, Models>,
): Promise<void> {
  if (import.meta.env.DEV) {
    await import("preact/debug");
  }

  const el = document.getElementById(pageDataScriptId);
  if (!el?.textContent) {
    throw new Error("boot: #page-data missing from the document");
  }

  // The page data is this bundle's own SSR output, so it is cast. Pages on
  // untrusted data decode inside their models function instead.
  const data = JSON.parse(el.textContent) as Data;
  hydrate(page.tree(page.models(data)), document.body);
}
