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
  fileId: "f1",
  versionId: "v1",
  reviewPassId: "pass",
  status: "running",
  startedAt: "2026-01-01T00:00:00.000Z",
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
  expect(model.active.value).toEqual({ run: run(), progress: null });

  const progress = { units: [{ id: "analyze", state: "running" }], marksPlaced: 2 };
  FakeEventSource.opened[0].emit("progress", progress);
  expect(model.active.value).toEqual({ run: run(), progress });
});

test("a settled run replaces its running entry and its stream closes", () => {
  const older = run({ id: "run-0", status: "completed", completedAt: "2026-01-01T00:00:01.000Z" });
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [run(), older]);
  const source = FakeEventSource.opened[0];

  const settled = run({
    status: "completed",
    completedAt: "2026-01-01T00:00:05.000Z",
    summary: "All good.",
  });
  source.emit("done", settled);

  expect(model.active.value).toBeNull();

  expect(model.runs.value.map((entry) => [entry.id, entry.status])).toEqual([
    ["run-1", "completed"],
    ["run-0", "completed"],
  ]);
  expect(source.closed).toBe(true);
});

test("whenSettled resolves with the run and the marks it placed", async () => {
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [run()]);
  const source = FakeEventSource.opened[0];
  const waiting = model.whenSettled("run-1");

  source.emit("progress", { units: [], marksPlaced: 4 });
  const settled = run({ status: "completed", completedAt: "2026-01-01T00:00:05.000Z" });
  source.emit("done", settled);

  expect(await waiting).toEqual({ run: settled, marksPlaced: 4 });
  // Asking after the run settled gets the same answer.
  expect(await model.whenSettled("run-1")).toEqual({ run: settled, marksPlaced: 4 });
});

test("asks for the trace stream with the trace detail", () => {
  const model = new ReviewRunsModel("ws", "essay.md", "trace", [run()]);
  expect(model.active.value?.run.id).toBe("run-1");
  expect(FakeEventSource.opened[0].url).toBe("/api/streams/review-runs/ws/run-1?detail=trace");
});

test("a running run is active on the server, where no stream opens", () => {
  vi.stubEnv("SSR", true);
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [run()]);
  expect(FakeEventSource.opened).toEqual([]);
  expect(model.active.value).toEqual({ run: run(), progress: null });
});

test("opens no stream without a running run", () => {
  const model = new ReviewRunsModel("ws", "essay.md", "progress", [
    run({ status: "completed", completedAt: "2026-01-01T00:00:01.000Z" }),
  ]);
  expect(FakeEventSource.opened).toEqual([]);
  expect(model.active.value).toBeNull();
});
