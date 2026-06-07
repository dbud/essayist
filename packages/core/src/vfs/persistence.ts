export interface PersistenceAdapter {
  get(key: string): Promise<unknown> | unknown;
  set(key: string, value: unknown): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  list(prefix?: string): AsyncIterable<string> | Iterable<string>;
}

export class InMemoryAdapter implements PersistenceAdapter {
  #store: Map<string, unknown>;

  constructor(initial?: Map<string, unknown> | Record<string, unknown>) {
    if (initial instanceof Map) {
      this.#store = new Map(initial);
    } else if (initial) {
      this.#store = new Map(Object.entries(initial));
    } else {
      this.#store = new Map();
    }
  }

  get(key: string): unknown {
    return this.#store.get(key);
  }

  set(key: string, value: unknown): void {
    this.#store.set(key, value);
  }

  delete(key: string): void {
    this.#store.delete(key);
  }

  list(prefix?: string): Iterable<string> {
    if (!prefix) return this.#store.keys();
    return [...this.#store.keys()].filter((k) => k.startsWith(prefix));
  }

  get store(): Map<string, unknown> {
    return this.#store;
  }
}
