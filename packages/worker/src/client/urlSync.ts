import { batch, effect, type ReadonlySignal } from "@preact/signals";

export type QueryValue = string | null | undefined;
export type QueryRecord = Record<string, QueryValue>;

/** The part of the URL the app owns: the path when given, and the keys of the query record. */
export interface UrlState {
  readonly path?: string;
  readonly query: QueryRecord;
}

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

function compose(href: string, { path, query }: UrlState): string {
  const url = new URL(href);
  if (path !== undefined) url.pathname = path;
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(query)) {
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
 * Keeps the state and the URL synchronized: state changes push a history entry (the very first
 * divergence replaces, covering an SSR-boot correction); pops hand the URL back to onPop, which
 * decides how it lands in the domain. Returns a teardown. Browser only; construct it from the
 * client boot.
 */
export function setupUrlSync(
  state: ReadonlySignal<UrlState>,
  onPop: (url: URL) => void,
  target: UrlTarget = browserTarget,
): () => void {
  let first = true;

  const disposeEffect = effect(() => {
    const replace = first;
    first = false;
    const current = target.href;
    const next = compose(current, state.value);
    if (next === current) return;
    if (replace) target.replace(next);
    else target.push(next);
  });

  const disposePop = target.onPop(() => {
    const url = new URL(target.href);
    batch(() => onPop(url));
  });

  return () => {
    disposePop();
    disposeEffect();
  };
}
