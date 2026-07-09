/// <reference lib="webworker" />
import type { Mark, ResolveInput } from "@essayist/core";
import { resolveMarks, setMyers } from "@essayist/core";
import init, { myers } from "@essayist/wasm";

interface MarksRequest {
  id: number;
  marks: Mark[];
  oldContent: string;
  newContent: string;
}

interface MarksResponse {
  id: number;
  result: Mark[];
}

// The worker owns the wasm Myers core for the marks path; the main thread
// never loads wasm. `setMyers` mutates this worker's own module instance, so
// `resolveMarks` -> `computeDiff` runs the wasm core here, off the main thread.
const ready = init().then(() => setMyers(myers));

self.onmessage = async (e: MessageEvent<MarksRequest>) => {
  await ready;
  const { id, marks, oldContent, newContent } = e.data;
  const input: ResolveInput = { marks, oldContent, newContent };
  const result = resolveMarks(input);
  self.postMessage({ id, result } satisfies MarksResponse);
};
