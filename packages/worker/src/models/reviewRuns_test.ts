import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ReviewRunData } from "./reviewRuns.data.ts";
import { ReviewRunsModel } from "./reviewRuns.ts";

class FakeEventSource {
  static opened: FakeEventSource[] = [];
  readonly listeners = new Map<string, (event: { data: string; lastEventId: string }) => void>();
  readyState = 1;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: { data: string; lastEventId: string }) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data), lastEventId: "" });
  }
}

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

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.stubEnv("SSR", false);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("follows the running run and exposes its progress", () => {
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [run()]);
  expect(FakeEventSource.opened.map((source) => source.url)).toEqual([
    "/api/streams/review-runs/ws/run-1",
  ]);
  expect(model.active.value).toEqual({ runId: "run-1", progress: null });

  const progress = { units: [{ id: "analyze", state: "running" }], marksPlaced: 2 };
  FakeEventSource.opened[0].emit("progress", progress);
  expect(model.active.value).toEqual({ runId: "run-1", progress });
});

test("a settled run replaces its running entry and its stream closes", () => {
  const older = run({ id: "run-0", status: "completed", completedAt: 1 });
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [run(), older]);
  const source = FakeEventSource.opened[0];

  source.emit("done", run({ status: "completed", completedAt: 5, summary: "All good." }));

  expect(model.active.value).toBeNull();
  expect(model.runs.value.map((entry) => [entry.id, entry.status])).toEqual([
    ["run-1", "completed"],
    ["run-0", "completed"],
  ]);
  expect(source.closed).toBe(true);
});

test("asks for the trace stream with the trace detail", () => {
  const model = new ReviewRunsModel("ws", "essay.md", "trace", [run()]);
  expect(model.active.value?.runId).toBe("run-1");
  expect(FakeEventSource.opened[0].url).toBe("/api/streams/review-runs/ws/run-1?detail=trace");
});

test("opens no stream without a running run", () => {
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [
    run({ status: "completed", completedAt: 1 }),
  ]);
  expect(FakeEventSource.opened).toEqual([]);
  expect(model.active.value).toBeNull();
});
