import { expect, test } from "vitest";

import { BatchAuthError, batchFailureMessage, formatBatchResult, runBatch } from "./batch.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

test("runBatch counts settles and per-item failures", async () => {
  const progress: Array<[number, number]> = [];
  const result = await runBatch(
    ["a", "b", "c"],
    async (item) => {
      if (item === "b") throw new Error("b: failed (409)");
    },
    { onProgress: (done, total) => progress.push([done, total]) },
  );
  expect(result).toEqual({
    total: 3,
    ok: 2,
    updated: 0,
    failed: ["b: failed (409)"],
    skipped: [],
  });
  expect(progress).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
});

test("runBatch counts rewrites through the task receipt", async () => {
  const result = await runBatch(["a", "b"], async (item) => {
    if (item === "b") return { updated: true };
  });
  expect(result.ok).toBe(2);
  expect(result.updated).toBe(1);
});

test("runBatch bounds the in-flight tasks to the concurrency limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const result = await runBatch(
    [1, 2, 3, 4, 5],
    async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight--;
    },
    { concurrency: 2 },
  );
  expect(result.ok).toBe(5);
  expect(maxInFlight).toBe(2);
});

test("runBatch dispatches items in order for a sequential flow", async () => {
  const started: string[] = [];
  await runBatch(
    ["a", "b", "c"],
    async () => {
      await tick();
    },
    {
      concurrency: 1,
      onStart: (item, index) => started.push(`${index}:${item}`),
    },
  );
  expect(started).toEqual(["0:a", "1:b", "2:c"]);
});

test("runBatch stops dispatching after an auth failure", async () => {
  const attempted: number[] = [];
  const err = await runBatch(
    [1, 2, 3, 4, 5],
    async (item) => {
      attempted.push(item);
      if (item === 2) throw new BatchAuthError();
      await tick();
    },
    { concurrency: 2 },
  ).catch((caught) => caught);
  expect(err).toBeInstanceOf(BatchAuthError);
  expect(attempted).toEqual([1, 2]);
  expect(err.result).toEqual({ total: 5, ok: 1, updated: 0, failed: [], skipped: [] });
});

test("runBatch reports upfront skips", async () => {
  const result = await runBatch(["a", "b"], async () => {}, { skipped: ["binary.md"] });
  expect(result.skipped).toEqual(["binary.md"]);
});

test("formatBatchResult reports each failure source", () => {
  const full = { total: 3, ok: 3, updated: 0, failed: [], skipped: [] };
  expect(formatBatchResult("Imported", full, "document")).toBe("Imported 3 documents");

  const partial = { total: 3, ok: 2, updated: 1, failed: ["a: failed (409)"], skipped: ["b"] };
  expect(formatBatchResult("Uploaded", partial, "file")).toBe(
    "Uploaded 2 of 3 files (1 updated, 1 failed, 1 binary file skipped)",
  );
});

test("batchFailureMessage keeps partial counts for auth failures", () => {
  const auth = new BatchAuthError({
    total: 3,
    ok: 1,
    updated: 0,
    failed: [],
    skipped: [],
  });
  expect(batchFailureMessage(auth, "Imported", "document")).toBe(
    "Imported 1 of 3 documents; sign in again, then retry",
  );
  expect(batchFailureMessage(new BatchAuthError(), "Imported", "document")).toBe(
    "sign in again, then retry",
  );
  expect(batchFailureMessage(new Error("disk full"), "Imported", "document")).toBe("disk full");
  expect(batchFailureMessage("weird", "Imported", "document")).toBe("the batch failed");
});
