import { effect, type ReadonlySignal } from "@preact/signals";

export type QueryValue = string | null | undefined;
export type QueryRecord = Record<string, QueryValue>;

export interface UrlTarget {
  get href(): string;
  push(url: string): void;
  replace(url: string): void;
  onPop(handler: () => void): () => void;
}

export function urlTarget(host: Window = window): UrlTarget {
  return {
    get href() {
      return host.location.href;
    },
    push: (url) => host.history.pushState(host.history.state, "", url),
    replace: (url) => host.history.replaceState(host.history.state, "", url),
    onPop: (handler) => {
      host.addEventListener("popstate", handler);
      return () => host.removeEventListener("popstate", handler);
    },
  };
}

const browserTarget = urlTarget();

function compose(href: string, record: QueryRecord): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  url.search = params.toString();
  return url.href;
}

/**
 * Keeps the record and the url query synchronized: record changes push a
 * history entry (the very first divergence replaces, covering an SSR-boot
 * correction); pops hand the parsed query back to onPop, which decides
 * how it lands in the domain. Returns a teardown. Browser only; construct
 * it from the client boot.
 */
export function setupUrlQuerySync(
  record: ReadonlySignal<QueryRecord>,
  onPop: (query: QueryRecord) => void,
  target: UrlTarget = browserTarget,
): () => void {
  let first = true;

  const disposeEffect = effect(() => {
    const replace = first;
    first = false;
    const current = target.href;
    const next = compose(current, record.value);
    if (next === current) return;
    replace ? target.replace(next) : target.push(next);
  });

  const disposePop = target.onPop(() => {
    const current = record.peek();
    const params = new URLSearchParams(new URL(target.href).search);
    const query: QueryRecord = {};
    for (const key of Object.keys(current)) {
      query[key] = params.get(key);
    }
    onPop(query);
  });

  return () => {
    disposePop();
    disposeEffect();
  };
}
