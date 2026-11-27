import { Files, ReviewRuns, TraceEvents, WorkspaceId, Workspaces } from "@essayist/core";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Effect, Option } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

import { env as makeEnv } from "#/env.ts";
import { janitorJob } from "#/reviews/janitor.ts";
import { runtime } from "#/runtime.ts";

// Isolated test storage starts empty; vitest.do.config.ts reads the migrations into a binding.
beforeEach(async () => {
  const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] };
  await applyD1Migrations(env.DB, TEST_MIGRATIONS);
});

/** A workspace with a file, and a running review of its first version on a pass that is gone. */
const startRun = (path: string) =>
  runtime(makeEnv(env)).runPromise(
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const owner = yield* Effect.orDie(workspaces.createUser({ email: `${path}@example.com` }));
      const workspace = yield* workspaces.createWorkspace("Smoke", owner.id);
      const run = yield* Effect.gen(function* () {
        const { file, version } = yield* Effect.orDie(
          Files.use((files) => files.createAt(path, "text")),
        );
        return yield* Effect.orDie(
          ReviewRuns.use((runs) =>
            runs.createRun({ fileId: file.id, versionId: version.id, reviewPassId: "none" }),
          ),
        );
      }).pipe(Effect.provideService(WorkspaceId, { wsId: workspace.id }));
      return { wsId: workspace.id, run };
    }),
  );

const inWorkspace = <A, E>(
  wsId: string,
  program: Effect.Effect<A, E, ReviewRuns | TraceEvents | WorkspaceId>,
) => runtime(makeEnv(env)).runPromise(Effect.provideService(program, WorkspaceId, { wsId }));

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

test("a woken run whose pass is gone fails and clears its alarm", async () => {
  const { wsId, run } = await startRun("driver-smoke.md");

  const driver = env.RUN_DRIVER.getByName(run.id);
  await driver.wake({ runId: run.id, wsId });
  await vi.waitFor(
    async () => {
      expect(await driver.alarmAt()).toBeNull();
    },
    { timeout: 5_000 },
  );

  const stored = await inWorkspace(
    wsId,
    ReviewRuns.use((runs) => runs.getRun(run.id)),
  );
  expect(stored.status).toBe("failed");
  expect(Option.getOrUndefined(stored.error)).toBe('Config missing: review pass "none"');
});

test("the janitor resumes a run that never got a driver", async () => {
  const e = makeEnv(env);
  const { wsId, run } = await startRun("janitor-smoke.md");

  const driver = env.RUN_DRIVER.getByName(run.id);
  expect(await driver.alarmAt()).toBeNull();

  await runtime(e).runPromise(janitorJob);

  // Its pass is gone, so the resumed drive settles it as failed.
  await vi.waitFor(
    async () => {
      const stored = await inWorkspace(
        wsId,
        ReviewRuns.use((runs) => runs.getRun(run.id)),
      );
      expect(stored.status).toBe("failed");
    },
    { timeout: 5_000 },
  );
});

test("a stream replays the trace past its cursor and stays open while the run runs", async () => {
  const { wsId, run } = await startRun("stream-smoke.md");
  await inWorkspace(
    wsId,
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      for (const seq of [1, 2, 3]) {
        yield* traces.append(run.id, {
          seq,
          at: seq,
          type: "node_start",
          nodeId: `n${seq}`,
        });
      }
    }),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  const reader = (await driver.stream({ wsId, runId: run.id }, 0, "trace")).getReader();
  const replayed = await readFrames(reader, 3);
  for (const seq of [1, 2, 3]) {
    expect(replayed).toContain(`event: trace`);
    expect(replayed).toContain(`id: ${seq}`);
    expect(replayed).toContain(`"seq":${seq}`);
  }
  expect(replayed).not.toContain("event: done");
  await reader.cancel();

  // A late attach resumes past its cursor instead of replaying from the top.
  const resumed = (await driver.stream({ wsId, runId: run.id }, 2, "trace")).getReader();
  const tail = await readFrames(resumed, 1);
  expect(tail).toContain(`id: 3`);
  expect(tail).not.toContain(`id: 2`);
  await resumed.cancel();
});

test("a stream ends with a done frame once the run settles", async () => {
  const { wsId, run } = await startRun("settle-smoke.md");
  await inWorkspace(
    wsId,
    ReviewRuns.use((runs) => runs.completeRun(run.id, "All good.")),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  const reader = (await driver.stream({ wsId, runId: run.id }, 0, "progress")).getReader();
  const frames = await readFrames(reader, 2);
  expect(frames).toContain("event: progress");
  expect(frames).toContain("event: done");
  expect(frames).toContain('"status":"completed"');
  expect(frames).toContain("All good.");
  const end = await reader.read();
  expect(end.done).toBe(true);
});

test("a progress stream sends a snapshot of the stored trace and none of its text", async () => {
  const { wsId, run } = await startRun("progress-smoke.md");
  await inWorkspace(
    wsId,
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      yield* traces.append(run.id, {
        seq: 1,
        at: 1,
        type: "custom",
        nodeId: "mechanics.apply",
        event: {
          type: "applied",
          attempts: [
            { selectedText: "a", comment: "c", marked: true, markId: "m1" },
            { selectedText: "b", comment: "c", marked: true, markId: "m2" },
            { selectedText: "x", comment: "c", marked: false, error: "selected text not found" },
          ],
        },
      });
      yield* traces.append(run.id, {
        seq: 2,
        at: 2,
        type: "custom",
        nodeId: "mechanics.propose",
        event: { type: "reasoning", text: "thinking out loud" },
      });
    }),
  );

  const driver = env.RUN_DRIVER.getByName(run.id);
  const reader = (await driver.stream({ wsId, runId: run.id }, -1, "progress")).getReader();
  const frames = await readFrames(reader, 1);
  expect(frames).not.toContain("event: trace");
  expect(frames).not.toContain("thinking out loud");
  // The pass "none" doesn't exist, so the plan has no units; placed marks still count.
  expect(frames).toContain("event: progress");
  expect(frames).toContain('"units":[]');
  expect(frames).toContain('"marksPlaced":2');
  expect(frames).toContain("id: 2");
  await reader.cancel();
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
