import { GlobalWindow } from "happy-dom";

export function withDOM<T>(f: (window: GlobalWindow) => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevMutationObserver = g.MutationObserver;
  const prevDOMParser = g.DOMParser;
  const prevGetComputedStyle = g.getComputedStyle;
  const win = new GlobalWindow();
  g.window = win;
  g.document = win.document;
  g.MutationObserver = win.MutationObserver;
  g.DOMParser = win.DOMParser;
  g.getComputedStyle = win.getComputedStyle;
  try {
    return f(win);
  } finally {
    g.window = prevWindow;
    g.document = prevDocument;
    g.MutationObserver = prevMutationObserver;
    g.DOMParser = prevDOMParser;
    g.getComputedStyle = prevGetComputedStyle;
    void win.happyDOM.close();
  }
}
