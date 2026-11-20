import type { ReviewProgress } from "@essayist/core";
import { signal } from "@preact/signals";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { FileMarksByPathModel } from "./fileMarksByPath.ts";
import type { FileSelection } from "./fileSelection.ts";
import type { ReviewRunData } from "./reviewRuns.data.ts";

const selection: FileSelection = { wsId: "ws", path: "essay.md", versionId: "v1" };

const run = (fields: Partial<ReviewRunData> = {}): ReviewRunData => ({
  id: "run-1",
  wsId: "ws",
  path: "essay.md",
  reviewPassId: "pass",
  versionId: "v1",
  status: "running",
  startedAt: 0,
  completedAt: null,
  error: null,
  summary: null,
  leaseOwner: null,
  heartbeatAt: null,
  ...fields,
});

const progress = (marksPlaced: number): ReviewProgress => ({ units: [], marksPlaced });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SSR", false);
  fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setup() {
  const active = signal<{ run: ReviewRunData; progress: ReviewProgress | null } | null>(null);
  const lastSettled = signal<ReviewRunData | null>(null);
  const reviewRuns = signal({ active, lastSettled });
  const model = new FileMarksByPathModel(signal(selection), reviewRuns, []);
  // Reading current rebuilds a dropped version, as the editor does through resolved marks.
  const reloads = () => {
    void model.current.value;
    return fetchMock.mock.calls.length;
  };
  return { active, lastSettled, reloads };
}

test("reloads the marks as the running review places them", () => {
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

test("reloads the marks once when the review settles", () => {
  const { lastSettled, reloads } = setup();

  lastSettled.value = run({ status: "completed", completedAt: 5 });
  expect(reloads()).toBe(1);

  lastSettled.value = run({ status: "completed", completedAt: 5 });
  expect(reloads()).toBe(1);
});
