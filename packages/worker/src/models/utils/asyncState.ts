import { type Signal, signal } from "@preact/signals";

export default function createAsyncState(initialLoading = false): [
  <T>(task: () => Promise<T>) => Promise<T | undefined>,
  {
    loading: Signal<boolean>;
    error: Signal<string>;
  },
] {
  // `loading` is the display state; `running` is the concurrent-run guard.
  // They are decoupled so a model can start in the loading state (e.g. for
  // SSR) without making the first `run` bail on the guard.
  const loading = signal(initialLoading);
  const running = signal(false);
  const error = signal("");

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (running.value) return;

    running.value = true;
    loading.value = true;
    error.value = "";

    try {
      return await task();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      running.value = false;
      loading.value = false;
    }
  }

  return [run, { loading, error }];
}
