import { expect, test } from "vitest";

import { BatchAuthError, batchFailureMessage, formatBatchResult, runBatch } from "./batch.ts";

test("runBatch counts settles and per-item failures", async () => {
  const progress: Array<[number, number]> = [];
  const result = await runBatch(
    ["a", "b", "c"],
    async (item) => {
      if (item === "b") throw new Error("b: failed (409)");
    },
    (done, total) => progress.push([done, total]),
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

test("runBatch rethrows auth errors with the partial counts", async () => {
  const err = await runBatch(["a", "b"], async (item) => {
    if (item === "b") throw new BatchAuthError();
  }).catch((caught) => caught);
  expect(err).toBeInstanceOf(BatchAuthError);
  expect(err.result).toEqual({ total: 2, ok: 1, updated: 0, failed: [], skipped: [] });
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
