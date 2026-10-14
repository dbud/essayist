import { hydrate } from "preact";
import type { HomeData } from "@/routes/home/loader";
import { HomePage } from "@/routes/home/page";

// The page module is shared with SSR; this boots it against the server
// markup, reconciling instead of remounting.
export function boot() {
  const el = document.getElementById("page-data");
  if (!el?.textContent) return;
  const data = JSON.parse(el.textContent) as HomeData;
  hydrate(<HomePage data={data} />, document.body);
}
