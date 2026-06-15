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

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.#store.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.#store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.#store.delete(key);
    return Promise.resolve();
  }

  async *list(prefix?: string): AsyncIterable<string> {
    for (const key of this.#store.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        yield key;
      }
    }
  }

  get store(): Map<string, unknown> {
    return this.#store;
  }
}
