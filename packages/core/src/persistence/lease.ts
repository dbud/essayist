import {
  ConcurrentModificationError,
  type Key,
  type PersistenceAdapter,
} from "./mod.ts";

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

/**
 * Take the lease on a record, so only one owner works on it at a time.
 *
 * Returns undefined when the record is gone, another owner holds a live
 * lease, or a concurrent claim won the race. Claiming as the current owner
 * renews.
 */
export async function claim<T>(
  adapter: PersistenceAdapter,
  key: Key,
  { owner, heartbeatAtLeast }: ClaimOptions,
): Promise<Leased<T> | undefined> {
  const entry = await adapter.get<Leased<T>>(key);
  if (!entry) return undefined;
  const { leaseOwner, heartbeatAt } = entry.value;
  const heldByOther = leaseOwner !== undefined && leaseOwner !== owner;
  if (heldByOther && (heartbeatAt ?? 0) >= heartbeatAtLeast) return undefined;
  const claimed: Leased<T> = {
    ...entry.value,
    leaseOwner: owner,
    heartbeatAt: Date.now(),
  };
  try {
    await adapter.batch([{ type: "set", key, value: claimed }], {
      checks: [{ key, versionstamp: entry.versionstamp }],
    });
  } catch (error) {
    if (error instanceof ConcurrentModificationError) return undefined;
    throw error;
  }
  return claimed;
}
