// Shared by the client batch flows: file uploads and the Google Docs import.

import { formatCount, pluralize } from "#/utils/format.ts";

/** Counts of a batch flow, mutated while it runs. */
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

/**
 * Thrown on a 401 from the api; `result` holds the counts reached so far. Attach a clone when the
 * batch keeps running afterwards.
 */
export class BatchAuthError extends Error {
  result?: BatchResult;

  constructor(result?: BatchResult) {
    super("sign in again, then retry");
    this.name = "BatchAuthError";
    this.result = result;
  }
}

/**
 * Run a task over every item in parallel and count the results. A thrown message becomes the failed
 * entry, so the task names its item in the message. Auth failures throw once, after the batch
 * settles, with the final counts.
 */
export async function runBatch<T>(
  items: readonly T[],
  task: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult> {
  const batch = startBatch(items.length);
  let done = 0;
  let authFailed = false;
  await Promise.allSettled(
    items.map(async (item) => {
      try {
        await task(item);
        batch.ok++;
      } catch (err) {
        if (err instanceof BatchAuthError) {
          authFailed = true;
        } else {
          batch.failed.push(err instanceof Error ? err.message : String(err));
        }
      } finally {
        done++;
        onProgress?.(done, batch.total);
      }
    }),
  );
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
