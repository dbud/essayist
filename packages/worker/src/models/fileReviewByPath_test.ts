import type { ReviewProgress } from "@essayist/core";
import { signal } from "@preact/signals";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { FileReviewByPathModel } from "./fileReviewByPath.ts";
import type { FileSelection } from "./fileSelection.ts";
import type { ReviewRunData } from "./reviewRuns.data.ts";

const selection: FileSelection = { wsId: "ws", path: "essay.md", versionId: "v1" };

const run = (fields: Partial<ReviewRunData> = {}): ReviewRunData => ({
  id: "run-1",
  fileId: "f1",
  versionId: "v1",
  reviewPassId: "pass",
  status: "running",
  startedAt: "2026-01-01T00:00:00.000Z",
  ...fields,
});

const progress = (marksPlaced: number): ReviewProgress => ({ units: [], marksPlaced });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SSR", false);
  fetchMock = vi.fn(async () => new Response("null", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setup() {
  const active = signal<{ run: ReviewRunData; progress: ReviewProgress | null } | null>(null);
  const reviewRuns = signal({ active });
  const model = new FileReviewByPathModel(signal(selection), reviewRuns, null);
  // reading current rebuilds a dropped review, as the editor does through resolved marks
  const reloads = () => {
    void model.current.value;
    return fetchMock.mock.calls.length;
  };
  return { active, reloads };
}

test("reloads the review as it places marks", () => {
  const { active, reloads } = setup();
  expect(reloads()).toBe(0);

  active.value = { run: run(), progress: null };
  active.value = { run: run(), progress: progress(0) };
  expect(reloads()).toBe(0);

  active.value = { run: run(), progress: progress(2) };
  expect(reloads()).toBe(1);

  // A new snapshot with the same count is not a change.
  active.value = { run: run(), progress: progress(2) };
  expect(reloads()).toBe(1);

  active.value = { run: run(), progress: progress(3) };
  expect(reloads()).toBe(2);
});
