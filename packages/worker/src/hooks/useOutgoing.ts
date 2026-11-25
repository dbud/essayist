import { useRef } from "preact/hooks";

interface Shown<K, R> {
  key: K;
  render: (current: boolean) => R;
}

/**
 * Keeps the previous key rendered after the key changes, so it can close while the new one opens.
 * The returned function renders the current key as `render(true)`, the previous key with its last
 * render function and `false`, and any other key as null.
 */
export function useOutgoing<K, R>(key: K, render: (current: boolean) => R): (at: K) => R | null {
  const shown = useRef<Shown<K, R> | null>(null);
  const outgoing = useRef<Shown<K, R> | null>(null);
  if (shown.current !== null && shown.current.key !== key) outgoing.current = shown.current;
  shown.current = { key, render };
  const previous = outgoing.current;
  return (at) => {
    if (at === key) return render(true);
    return previous !== null && at === previous.key ? previous.render(false) : null;
  };
}
