/// <reference lib="webworker" />
import init, { sort_ints } from "@essayist/wasm";

interface SortRequest {
  id: number;
  arr: Int32Array;
}

const ready = init();

self.onmessage = async (e: MessageEvent<SortRequest>) => {
  await ready;
  const { id, arr } = e.data;
  const result = sort_ints(arr);
  self.postMessage({ id, result }, [result.buffer]);
};
