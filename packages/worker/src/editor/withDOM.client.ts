/**
 * The client flavor: the DOM exists, so the callback runs against it. The client environment binds
 * `#/editor/withDOM.ts` here (vite.config.ts), keeping happy-dom out of the client graph.
 */
export function withDOM<T>(f: (window: Window) => T): T {
  return f(window);
}
