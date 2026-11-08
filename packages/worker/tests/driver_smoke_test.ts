import { ReviewRuns, TraceEvents, WorkspaceId } from "@essayist/core";
import { KV_D1_SCHEMA } from "@essayist/core/kv_d1";
import { env } from "cloudflare:workers";
import { Effect } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

import { env as makeEnv } from "#/env.ts";
import { janitorJob } from "#/reviews/janitor.ts";
import { runtime } from "#/runtime.ts";

// Isolated test storage starts empty; in production the kv table is applied out of band.
beforeEach(async () => {
  await env.DB.prepare(KV_D1_SCHEMA).run();
});

test("the D1 and driver bindings are reachable", () => {
  expect(env.DB).toBeDefined();
  expect(env.RUN_DRIVER).toBeDefined();
});

test("the driver DO answers an alarm probe", async () => {
  const driver = env.RUN_DRIVER.getByName("smoke");
  expect(await driver.alarmAt()).toBeNull();
});

test("a woken run settles and clears its alarm", async () => {
  const driver = env.RUN_DRIVER.getByName("missing");
  await driver.wake({ runId: "missing", wsId: "smoke-ws" });
  await vi.waitFor(
    async () => {
      expect(await driver.alarmAt()).toBeNull();
    },
    { timeout: 5_000 },
  );
});

test("a woken run without an active pass stays parked with its alarm armed", async () => {
  const e = makeEnv(env);
  const run = await runtime(e).runPromise(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      return yield* runs.createRun({
        path: "driver-smoke.md",
        versionId: "v1",
        reviewPassId: "none",
      });
    }).pipe(Effect.provideService(WorkspaceId, { wsId: "smoke-ws" })),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  await driver.wake({ runId: run.id, wsId: run.wsId });
  await vi.waitFor(
    async () => {
      const alarmAt = await driver.alarmAt();
      expect(alarmAt ?? 0).toBeGreaterThan(Date.now() + 60_000);
    },
    { timeout: 5_000 },
  );

  const stored = await runtime(e).runPromise(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      return yield* runs.getRun(run.id);
    }).pipe(Effect.provideService(WorkspaceId, { wsId: run.wsId })),
  );
  expect(stored?.status).toBe("running");
});

test("the janitor resumes a run that never got a driver", async () => {
  const e = makeEnv(env);
  const run = await runtime(e).runPromise(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      return yield* runs.createRun({
        path: "janitor-smoke.md",
        versionId: "v1",
        reviewPassId: "none",
      });
    }).pipe(Effect.provideService(WorkspaceId, { wsId: "smoke-ws" })),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  expect(await driver.alarmAt()).toBeNull();

  await runtime(e).runPromise(janitorJob);

  await vi.waitFor(
    async () => {
      const alarmAt = await driver.alarmAt();
      expect(alarmAt ?? 0).toBeGreaterThan(Date.now() + 60_000);
    },
    { timeout: 5_000 },
  );
});

test("a stream replays the trace past its cursor and stays open while the run runs", async () => {
  const e = makeEnv(env);
  const run = await runtime(e).runPromise(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const traces = yield* TraceEvents;
      const created = yield* runs.createRun({
        path: "stream-smoke.md",
        versionId: "v1",
        reviewPassId: "none",
      });
      for (const seq of [1, 2, 3]) {
        yield* traces.append(created.id, {
          seq,
          at: seq,
          type: "node_start",
          nodeId: `n${seq}`,
        });
      }
      return created;
    }).pipe(Effect.provideService(WorkspaceId, { wsId: "smoke-ws" })),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  const reader = (await driver.stream({ wsId: "smoke-ws", runId: run.id }, 0)).getReader();
  const replayed = await readFrames(reader, 3);
  for (const seq of [1, 2, 3]) {
    expect(replayed).toContain(`event: trace`);
    expect(replayed).toContain(`id: ${seq}`);
    expect(replayed).toContain(`"seq":${seq}`);
  }
  expect(replayed).not.toContain("event: done");
  await reader.cancel();

  // A late attach resumes past its cursor instead of replaying from the top.
  const resumed = (await driver.stream({ wsId: "smoke-ws", runId: run.id }, 2)).getReader();
  const tail = await readFrames(resumed, 1);
  expect(tail).toContain(`id: 3`);
  expect(tail).not.toContain(`id: 2`);
  await resumed.cancel();
});

test("a stream ends with a done frame once the run settles", async () => {
  const e = makeEnv(env);
  const run = await runtime(e).runPromise(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "settle-smoke.md",
        versionId: "v1",
        reviewPassId: "none",
      });
      yield* runs.completeRun(created.id, "All good.");
      return created;
    }).pipe(Effect.provideService(WorkspaceId, { wsId: "smoke-ws" })),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  const reader = (await driver.stream({ wsId: "smoke-ws", runId: run.id }, 0)).getReader();
  const frames = await readFrames(reader, 1);
  expect(frames).toContain("event: done");
  expect(frames).toContain('"status":"completed"');
  expect(frames).toContain("All good.");
  const end = await reader.read();
  expect(end.done).toBe(true);
});

/** Reads until the stream has delivered enough frames to cover the asked count. */
async function readFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  counts: number,
): Promise<string> {
  const decoder = new TextDecoder();
  const seen: string[] = [];
  while (counts > 0) {
    const { value, done } = await reader.read();
    if (done) throw new Error("the stream closed early");
    const text = decoder.decode(value ?? new Uint8Array());
    seen.push(text);
    counts -= text.split("event: ").length - 1;
  }
  return seen.join("");
}
