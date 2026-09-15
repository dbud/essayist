/**
 * Waits for an external script to be available, injecting a tag when the
 * page has not already rendered one. Resolves immediately when the global
 * the script defines is already present (e.g. island remount). Concurrent
 * calls for the same src share one promise; a failed load clears the cache
 * so a later call can retry.
 */
const pending = new Map<string, Promise<void>>();

export function loadScript(src: string, isReady: () => boolean): Promise<void> {
  const cached = pending.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    if (isReady()) {
      resolve();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      pending.delete(src);
      reject(new Error(`Failed to load script ${src}`));
    });
  });
  pending.set(src, promise);
  return promise;
}
