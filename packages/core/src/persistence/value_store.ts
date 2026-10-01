/**
 * Stores JSON values under a key prefix, split across KV entries when a
 * value does not fit in one.
 *
 * Values are serialized before splitting, so the chunk budget applies to the
 * stored form rather than the text it came from.
 */

import {
  assembleList,
  chunkKeyPart,
  planChunks,
  unframeChunk,
} from "./chunked.ts";
import type { Key, PersistenceAdapter } from "./mod.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface StoredValue<T> {
  key: Key;
  value: T;
}

export class ChunkedValueStore<T> {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  /**
   * Write a value, splitting it across entries when it does not fit. The
   * value's own key holds the first chunk; the rest take "c1", "c2" and so
   * on, which sort directly after it.
   *
   * Chunks left over from a longer previous value are deleted, since they
   * would otherwise be read back as part of this value.
   */
  async put(key: Key, value: T): Promise<void> {
    // Read the head before overwriting it, to learn how many chunks the
    // previous value had.
    const previous = await this.#adapter.get<Uint8Array>(key);
    const chunks = planChunks(encoder.encode(JSON.stringify(value)));
    for (const chunk of chunks) {
      await this.#adapter.set([...key, ...chunk.key], chunk.value);
    }
    const stale = unframeChunk(previous?.value)?.nChunks ?? 0;
    for (let i = chunks.length; i < stale; i++) {
      await this.#adapter.delete([...key, chunkKeyPart(i, stale)]);
    }
  }

  /**
   * Read every value under a prefix, in key order. Throws when a value is
   * missing a chunk, naming the key and how many chunks did arrive.
   */
  async list(prefix: Key): Promise<StoredValue<T>[]> {
    const { entries } = await this.#adapter.list<Uint8Array>(prefix);
    return assembleList(entries).map((assembled) => {
      if (!assembled.payload) {
        throw new Error(
          `Value at ${String(assembled.key)} is missing chunks: ` +
            `${assembled.nReceived} of ${assembled.nChunks}`,
        );
      }
      return {
        key: assembled.key,
        value: JSON.parse(decoder.decode(assembled.payload)) as T,
      };
    });
  }
}
