/** Persistence layer for the VFS: a key/value adapter with tuple keys. */

/** A tuple key. Parts are strings; KV supports richer types but we don't need them. */
export type Key = readonly string[];

/** A stored entry: its key, value, and versionstamp (for optimistic concurrency). */
export interface Entry<T = unknown> {
  key: Key;
  value: T;
  versionstamp: string;
}

/** Read consistency. In-memory ignores it; KV maps it to `strong`/`eventual`. */
export interface ReadOptions {
  consistency?: "strong" | "eventual";
}

/** Options for paginated scans. */
export interface ListOptions extends ReadOptions {
  /** Max entries to return in this page. */
  limit?: number;
  /** Opaque cursor returned by a previous {@link ListResult.cursor}. */
  cursor?: string;
  /** Reverse iteration (descending tuple order). */
  reverse?: boolean;
}

/** A page of a scan. `cursor` is present when more results remain. */
export interface ListResult<T = unknown> {
  entries: Entry<T>[];
  cursor?: string;
}

/** A write applied atomically within one batch call. */
export type WriteOp =
  | { type: "set"; key: Key; value: unknown }
  | { type: "delete"; key: Key };

/** Options for a batch write. */
export interface BatchOptions {
  /**
   * Optimistic-concurrency guards. The batch commits only if every guard
   * passes against the current store state:
   * - `versionstamp: null` requires the key to be absent.
   * - `versionstamp: "<v>"` requires the key to be present with that exact
   *   versionstamp.
   * On any mismatch the whole batch is rejected (no ops applied) and an error
   * is thrown.
   */
  checks?: Array<{ key: Key; versionstamp: string | null }>;
}

/** Error thrown when the `checks` of a batch fail optimistic-concurrency validation. */
export class ConcurrentModificationError extends Error {
  constructor(public readonly key: Key) {
    super(`Concurrent modification detected for key ${JSON.stringify(key)}`);
  }
}

/** Fields a record carries to be leasable by one owner at a time. */
export interface Lease {
  /** Id of the driver currently advancing this record. */
  leaseOwner?: string;
  /** When the owner last proved it was alive. */
  heartbeatAt?: number;
}

/** A record with {@link Lease} fields on it. */
export type Leased<T> = T & Lease;

export interface ClaimOptions {
  owner: string;
  heartbeatAtLeast: number;
}

/** Leases the service layer puts on records: claims and heartbeats read and
 * write the {@link Lease} fields with checked batches. */
export { Persistence, PersistenceError } from "./service.ts";
