import { ReviewRuns, WorkspaceId } from "@essayist/core";
import { KV_D1_SCHEMA } from "@essayist/core/kv_d1";
import { env } from "cloudflare:workers";
import { Effect } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

import { env as makeEnv } from "#/env.ts";
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
  const stub = env.RUN_DRIVER.getByName("smoke");
  expect(await stub.alarmAt()).toBeNull();
});

test("a kicked run settles and clears its alarm", async () => {
  const stub = env.RUN_DRIVER.getByName("missing");
  await stub.start({ runId: "missing", wsId: "smoke-ws" });
  await vi.waitFor(
    async () => {
      expect(await stub.alarmAt()).toBeNull();
    },
    { timeout: 5_000 },
  );
});

test("a kicked run without an active pass stays parked with its beat armed", async () => {
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

  const stub = env.RUN_DRIVER.getByName(run.id);
  await stub.start({ runId: run.id, wsId: run.wsId });
  await vi.waitFor(
    async () => {
      const alarmAt = await stub.alarmAt();
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
