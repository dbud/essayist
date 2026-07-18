import { type Signal, signal } from "@preact/signals";

export interface Progress {
  total: number;
  done: number;
  complete: boolean;
  errors: string[];
}

/**
 * Returns a `run` function plus a `progress` signal and `clear` action,
 * mirroring the `[run, { ...state }]` shape of `createAsyncState`. `run`
 * fans out N async tasks in parallel, counting completions and collecting
 * thrown errors into the progress signal. `progress` is `null` when idle.
 */
export default function createProgressState(): [
  <I>(items: I[], task: (item: I) => Promise<void>) => Promise<void>,
  {
    progress: Signal<Progress | null>;
    clear: () => void;
  },
] {
  const progress = signal<Progress | null>(null);

  async function run<I>(
    items: I[],
    task: (item: I) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;
    progress.value = {
      total: items.length,
      done: 0,
      complete: false,
      errors: [],
    };
    await Promise.all(
      items.map(async (item) => {
        let error: string | null = null;
        try {
          await task(item);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        } finally {
          const current = progress.value;
          if (current) {
            if (error !== null) current.errors.push(error);
            current.done++;
            current.complete = current.done >= current.total;
            // Shallow copy to trip signal subscribers; nested fields
            // (like `errors`) are shared so they accumulate across updates.
            progress.value = { ...current };
          }
        }
      }),
    );
  }

  function clear(): void {
    progress.value = null;
  }

  return [run, { progress, clear }];
}
