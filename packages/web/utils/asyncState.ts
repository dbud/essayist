import { Signal, signal } from "@preact/signals";

export default function createAsyncState(): [
  <T>(task: () => Promise<T>) => Promise<T | undefined>,
  {
    loading: Signal<boolean>;
    error: Signal<string>;
  },
] {
  const loading = signal(false);
  const error = signal("");

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (loading.value) return;

    loading.value = true;
    error.value = "";

    try {
      return await task();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  return [run, { loading, error }];
}
