/**
 * Run `fn` and log its execution time with high precision.
 *
 * Uses `performance.now()`, which is monotonic and sub-millisecond in browsers
 * and Deno. Reports microseconds (3 decimals). The label is optional but
 * recommended when measuring several regions in a row so the log lines are
 * distinguishable. The timing is logged in a `finally` block, so it is
 * reported even when `fn` throws.
 *
 * @example
 * const oldTokens = measure(() => tokenize(oldText), "tokenize.old");
 */
export function measure<T>(fn: () => T, label?: string): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    report(start, label);
  }
}

/**
 * Await `fn` and log its execution time with high precision, including the
 * time spent waiting for the promise. Reports microseconds (3 decimals) and
 * is logged in a `finally` block, so it is reported even when the promise
 * rejects. The label is optional but recommended when measuring several
 * regions in a row so the log lines are distinguishable.
 *
 * @example
 * const marks = await measureAsync(
 *   () => resolveMarksViaWorker(input),
 *   "marks.resolve",
 * );
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
  label?: string,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    report(start, label);
  }
}

function report(start: number, label?: string): void {
  const ms = performance.now() - start;
  const line = label ? `${label}: ${ms.toFixed(3)}ms` : `${ms.toFixed(3)}ms`;
  console.debug(line);
}
