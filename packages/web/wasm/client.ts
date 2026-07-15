import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";
import { IS_BROWSER } from "fresh/runtime";
import { createWorkerClient } from "@/utils/workerClient.ts";

const client = createWorkerClient<
  { marks: Mark[]; oldContent: string; newContent: string },
  Mark[]
>(
  () =>
    new Worker(new URL("./worker.ts", import.meta.url).href, {
      type: "module",
    }),
);

export function resolveMarksViaWorker(
  marks: Mark[],
  oldContent: string,
  newContent: string,
  signal?: AbortSignal,
): Promise<Mark[]> {
  // SSR: no Worker / wasm on the server -- run the sync JS-core `resolveMarks`
  // inline. The browser uses the worker below.
  if (!IS_BROWSER) {
    return Promise.resolve(resolveMarks({ marks, oldContent, newContent }));
  }
  return client.dispatch({ marks, oldContent, newContent }, signal);
}
