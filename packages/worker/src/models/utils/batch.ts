// Shared by the client batch flows: file uploads and the Google Docs import.

import { formatCount, pluralize } from "#/utils/format.ts";

export interface BatchResult {
  total: number;
  ok: number;
  /** Of the ok items, the ones that rewrote existing files. */
  updated: number;
  /** Thrown failure messages, each naming its item. */
  failed: string[];
  /** Items left out, e.g. binaries; not part of total. */
  skipped: string[];
}

export function startBatch(total: number): BatchResult {
  return { total, ok: 0, updated: 0, failed: [], skipped: [] };
}

/** Thrown on a 401 from the api; `result` holds the counts reached so far. */
export class BatchAuthError extends Error {
  result?: BatchResult;

  constructor(result?: BatchResult) {
    super("sign in again, then retry");
    this.name = "BatchAuthError";
    this.result = result;
  }
}

/** Returned by a task after its item rewrote an existing file. */
export interface BatchReceipt {
  readonly updated?: boolean;
}

export interface RunBatchOptions<T> {
  /** Parallel workers; defaults to all items at once. */
  readonly concurrency?: number;
  /** Items excluded before the batch, reported on the result. */
  readonly skipped?: readonly string[];
  readonly onStart?: (item: T, index: number) => void;
  readonly onProgress?: (done: number, total: number) => void;
}

/** Run a task over the items with a concurrency limit. A thrown message becomes a `failed`
 * entry; a thrown BatchAuthError stops starting further items and rethrows after the in-flight
 * tasks settle. */
export async function runBatch<T>(
  items: readonly T[],
  task: (item: T) => Promise<void | BatchReceipt>,
  options?: RunBatchOptions<T>,
): Promise<BatchResult> {
  const batch = startBatch(items.length);
  if (options?.skipped) batch.skipped.push(...options.skipped);
  let done = 0;
  let next = 0;
  let authFailed = false;
  const limit = Math.min(Math.max(options?.concurrency ?? items.length, 1), items.length);
  const workers = Array.from({ length: limit }, () =>
    (async () => {
      while (next < items.length && !authFailed) {
        const index = next++;
        const item = items[index];
        options?.onStart?.(item, index);
        try {
          const receipt = await task(item);
          batch.ok++;
          if (receipt?.updated) batch.updated++;
        } catch (err) {
          if (err instanceof BatchAuthError) {
            authFailed = true;
          } else {
            batch.failed.push(err instanceof Error ? err.message : String(err));
          }
        } finally {
          done++;
          options?.onProgress?.(done, batch.total);
        }
      }
    })(),
  );
  await Promise.all(workers);
  if (authFailed) throw new BatchAuthError(structuredClone(batch));
  return batch;
}

/**
 * "Imported 3 documents", "Uploaded 2 of 3 files (1 failed)", with updated, failed, and skipped
 * counts appended when present.
 */
export function formatBatchResult(prefix: string, result: BatchResult, noun: string): string {
  const head =
    result.ok === result.total
      ? `${prefix} ${formatCount(result.ok, noun)}`
      : `${prefix} ${result.ok} of ${result.total} ${pluralize(result.total, noun)}`;
  const parts = [
    ...(result.updated > 0 ? [`${result.updated} updated`] : []),
    ...(result.failed.length > 0 ? [`${result.failed.length} failed`] : []),
    ...(result.skipped.length > 0
      ? [`${formatCount(result.skipped.length, "binary file")} skipped`]
      : []),
  ];
  return parts.length === 0 ? head : `${head} (${parts.join(", ")})`;
}

/**
 * The toast message for a failed batch: auth failures keep the partial summary plus the sign-in
 * hint; otherwise the thrown message passes through.
 */
export function batchFailureMessage(err: unknown, prefix: string, noun: string): string {
  if (err instanceof BatchAuthError) {
    const summary =
      err.result === undefined ? "" : `${formatBatchResult(prefix, err.result, noun)}; `;
    return `${summary}sign in again, then retry`;
  }
  return err instanceof Error ? err.message : "the batch failed";
}
