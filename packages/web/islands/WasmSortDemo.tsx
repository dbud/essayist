import { useSignal } from "@preact/signals";
import { sortInts } from "@/wasm/client.ts";

// Demo island that drives the wasm sort worker, so the worker is reachable in
// the build and runtime-testable. Remove once the marks resolver uses the
// worker (step 6); the worker/client modules stay.
export default function WasmSortDemo() {
  const result = useSignal("");
  const busy = useSignal(false);

  async function run() {
    busy.value = true;
    try {
      const n = 200_000;
      const input = new Int32Array(n);
      for (let i = 0; i < n; i++) input[i] = n - i; // descending
      const start = performance.now();
      const sorted = await sortInts(input);
      const ms = (performance.now() - start).toFixed(1);
      result.value = `sorted ${n} ints in ${ms}ms; [0]=${sorted[0]} [${n - 1}]=${sorted[n - 1]}`;
    } catch (e) {
      result.value = `error: ${e}`;
    } finally {
      busy.value = false;
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="btn btn-sm"
        onClick={run}
        disabled={busy.value}
      >
        {busy.value ? "Sorting..." : "Sort 200k ints (wasm worker)"}
      </button>
      <div class="text-sm text-base-content/70">{result.value}</div>
    </div>
  );
}
