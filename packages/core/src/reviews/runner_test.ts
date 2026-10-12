import { assert, assertEquals, assertRejects } from "@std/assert";
import { type Context, Effect, Layer } from "effect";
import type { ResolvedReviewPass, ReviewUnit } from "@/config/types.ts";
import type { NodeRun } from "@/flow/types.ts";
import { ChunkedValues } from "@/persistence/chunked_values.ts";
import { KvAdapter } from "@/persistence/kv_adapter.ts";
import { kvLayer } from "@/persistence/kv_layer.ts";
import {
  ReviewFileMissingError,
  ReviewLeaseTakenError,
  ReviewRunMissingError,
  type RunReviewPassOptions,
  resumeReviewPass,
  runReviewPass,
} from "@/reviews/runner.ts";
import { ReviewRuns } from "@/reviews/service.ts";
import { createSpyClient } from "@/reviews/testing/agent.ts";
import { TraceEvents } from "@/reviews/trace/service.ts";
import type { TraceEvent } from "@/reviews/trace/types.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import { createFile } from "@/vfs/testing/helpers.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";

function unitFixture(
  partial: Partial<ReviewUnit> & Pick<ReviewUnit, "id">,
): ReviewUnit {
  return { promptKey: "dir", ...partial };
}

function passFixture(units: ReviewUnit[]): ResolvedReviewPass {
  return {
    pass: {
      id: "essay-review",
      name: "Essay review",
      systemPromptKey: "sys",
      modelPoolId: "pool",
      units,
    },
    units: units.map((unit) => ({
      id: unit.id,
      prompts: {
        system: "You are an editor.",
        directive: "Review the essay.",
        instructions: "",
        categories: "",
      },
      pool: { id: "pool", name: "Pool", models: ["m/a"] },
      inputs: unit.inputs ?? [],
      ...(unit.attempt && {
        attempt: {
          categories: [{ id: "grammar", label: "grammar" }],
          repairRounds: unit.attempt.repairRounds ?? 1,
        },
      }),
      ...(unit.summary && { summary: true }),
    })),
  };
}

// The trace-store fixture and the runner's services share one
// KV store, so runs written on either side are read back on both.
async function setup() {
  const kv = await Deno.openKv(":memory:");
  const adapter = new KvAdapter(kv);
  const env = Layer.provide(
    Layer.mergeAll(
      ReviewRuns.layerNoDeps,
      Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
      ChunkedValues.layerNoDeps,
    ),
    kvLayer(kv),
  );
  return { adapter, env };
}

/** Run a small program against the test's shared KV store: the body gets
 * both services, as they come out of the shared env. */
function viaRuns<A>(
  env: Layer.Layer<ReviewRuns | TraceEvents>,
  body: (deps: {
    runs: Context.Service.Shape<typeof ReviewRuns>;
    traces: Context.Service.Shape<typeof TraceEvents>;
  }) => Effect.Effect<A, unknown, WorkspaceId>,
): Promise<A> {
  return Effect.runPromise(
    Effect.provide(
      Effect.provideService(
        Effect.gen(function* () {
          const runs = yield* ReviewRuns;
          const traces = yield* TraceEvents;
          return yield* body({ runs, traces });
        }),
        WorkspaceId,
        { wsId: "ws" },
      ),
      env,
    ),
  );
}

async function runPass(
  env: Layer.Layer<ReviewRuns | TraceEvents>,
  options: RunReviewPassOptions,
): Promise<ReviewRun> {
  return await Effect.runPromise(
    Effect.provide(
      Effect.provideService(runReviewPass(options), WorkspaceId, {
        wsId: options.wsId,
      }),
      env,
    ),
  );
}

async function resumePass(
  env: Layer.Layer<ReviewRuns | TraceEvents>,
  options: RunReviewPassOptions,
  runId: string,
): Promise<ReviewRun> {
  return await Effect.runPromise(
    Effect.provide(
      Effect.provideService(resumeReviewPass(options, runId), WorkspaceId, {
        wsId: options.wsId,
      }),
      env,
    ),
  );
}

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

/** Per-node event type sequences; cross-node order varies with the
 * scheduler, per-node order is fixed. Custom events carry the host
 * event's type. */
function byNode(trace: TraceEvent[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const event of trace) {
    const type = event.type === "custom" ? event.event.type : event.type;
    grouped[event.nodeId] = [...(grouped[event.nodeId] ?? []), type];
  }
  return grouped;
}

function nodeEnd(trace: TraceEvent[], nodeId: string): NodeRun | undefined {
  const event = trace.find(
    (candidate) => candidate.type === "node_end" && candidate.nodeId === nodeId,
  );
  return event?.type === "node_end" ? event.run : undefined;
}

function appliedEvents(trace: TraceEvent[]) {
  return trace.flatMap((event) =>
    event.type === "custom" && event.event.type === "applied"
      ? [event.event]
      : [],
  );
}

Deno.test("runReviewPass -- completes a pass with marks, summary, and a per-node trace", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const { env } = await setup();
  const { agent, inputs } = createSpyClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selected_text":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runPass(env, {
    agent,
    vfs,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({
        id: "synthesize",
        summary: true,
        inputs: ["analyze", "mechanics.propose"],
      }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Solid draft.");

  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "brave");
  assertEquals(marks[0].meta, {
    runId: run.id,
    unitId: "mechanics",
  });

  const trace = (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    analyze: [
      "node_start",
      "prompt",
      "model_call",
      "reasoning",
      "output",
      "node_end",
    ],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.collect": ["node_start", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": ["node_start", "node_end"],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    synthesize: ["node_start", "prompt", "model_call", "output", "node_end"],
  });
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts.length, 1);
  assertEquals(applied[0].attempts[0].marked, true);
  assertEquals(applied[1].attempts.length, 0);
  assertEquals(inputs.length, 3);
  assertEquals(inputs[1].includes("Thesis: Drafts are raw material."), true);
});

Deno.test("runReviewPass -- a repair round re-quotes the failed spans", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const { env } = await setup();
  const { agent, inputs } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runPass(env, {
    agent,
    vfs,
    pass: passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Solid draft.");

  const trace = (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.collect": ["node_start", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    summary: ["node_start", "prompt", "model_call", "output", "node_end"],
  });
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  assertEquals(applied[1].attempts[0].marked, true);
  // The repair prompt quotes the failed span and its surroundings.
  assertEquals(inputs[1].includes('Attempted span: "ghost span"'), true);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "hello");
});

Deno.test("runReviewPass -- a zero budget keeps failed marks with no repair nodes", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const { env } = await setup();
  const { agent } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runPass(env, {
    agent,
    vfs,
    pass: passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 0 },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  const trace = (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(Object.keys(byNode(trace)), [
    "content",
    "mechanics.propose",
    "mechanics.apply",
    "mechanics.collect",
    "summary",
  ]);
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks, []);
});

Deno.test("runReviewPass -- resuming a run that does not exist is an error", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { env } = await setup();
  const { agent } = createSpyClient([{ text: ANALYSIS_ROUND }]);

  await assertRejects(
    () =>
      resumePass(
        env,
        {
          agent,
          vfs,
          pass: passFixture([unitFixture({ id: "analyze" })]),
          wsId: "ws",
          path: "essay.txt",
        },
        "no-such-run",
      ),
    ReviewRunMissingError,
    "Cannot resume: no run no-such-run",
  );
});

Deno.test("runReviewPass -- a resumed pass skips completed nodes and shows each once", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const { env } = await setup();
  // First attempt: analyze succeeds, then the unit below it fails on bad JSON.
  const first = createSpyClient([
    { text: ANALYSIS_ROUND },
    { text: "not json" },
  ]);

  const run = await runPass(env, {
    agent: first.agent,
    vfs,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  const interrupted =
    (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  // analyze completed, so its artifacts are recoverable from the trace.
  assertEquals(nodeEnd(interrupted, "analyze")?.status, "completed");

  // Second attempt over the same run: the fold supplies analyze's artifacts,
  // so only the failed unit is scheduled.
  const second = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const resumed = await resumePass(
    env,
    {
      agent: second.agent,
      vfs,
      pass: passFixture([
        unitFixture({ id: "analyze" }),
        unitFixture({
          id: "mechanics",
          attempt: { allowedCategoryIds: ["grammar"] },
          inputs: ["analyze"],
        }),
        unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
      ]),
      wsId: "ws",
      path: "essay.txt",
    },
    run.id,
  );

  assertEquals(resumed.status, "completed");
  // The resumed attempt did not re-run analyze.
  assertEquals(second.inputs.length, 2);
  assertEquals(second.inputs[0].includes("Good."), false);

  const trace = (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  const analyzeEvents = byNode(trace).analyze;
  assertEquals(analyzeEvents.filter((type) => type === "node_start").length, 1);
  assertEquals(analyzeEvents.filter((type) => type === "node_end").length, 1);
  // The first attempt's mark never reached the VFS, so the retry's does.
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0]?.selected_text, "brave");
});

Deno.test("runReviewPass -- a node error fails the run and skips dependents", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { env } = await setup();
  const { agent } = createSpyClient([{ text: "not json" }]);

  const run = await runPass(env, {
    agent,
    vfs,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({
        id: "synthesize",
        summary: true,
        inputs: ["analyze"],
      }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes("not valid JSON"), true);

  const trace = (await viaRuns(env, (deps) => deps.traces.get(run.id))) ?? [];
  const grouped = byNode(trace);
  // The prompt is recorded before each call, the repair says why the first
  // reply was rejected, and the re-ask that also failed leaves two
  // model_call events with a repair between them.
  assertEquals(grouped.analyze, [
    "node_start",
    "prompt",
    "model_call",
    "repair",
    "prompt",
    "model_call",
    "repair",
    "node_end",
  ]);
  assertEquals(nodeEnd(trace, "analyze")?.status, "failed");
  for (const nodeId of [
    "mechanics.propose",
    "mechanics.apply",
    "mechanics.collect",
    "mechanics.repair1.gate",
    "mechanics.repair1.propose",
    "mechanics.repair1.apply",
    "synthesize",
  ]) {
    const skipped = nodeEnd(trace, nodeId);
    assertEquals(skipped?.status, "skipped");
    assertEquals(
      skipped?.status === "skipped"
        ? skipped.reason.includes('dependency "analyze" failed')
        : false,
      true,
    );
    assertEquals(grouped[nodeId], ["node_end"]);
  }
});

Deno.test("runReviewPass -- fails a pass that commits no summary", async () => {
  const vfs = await createFile("essay.txt", "hello world").then((f) => f.vfs);
  const { env } = await setup();
  const { agent } = createSpyClient([{ text: ANALYSIS_ROUND }]);

  const run = await runPass(env, {
    agent,
    vfs,
    // No summary unit, so the graph commits no summary artifact. Reading it
    // back is a structural surprise, not a pass with a blank summary.
    pass: passFixture([unitFixture({ id: "analyze" })]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes('exactly one "summary"'), true);
  assertEquals(run.summary, undefined);
});

Deno.test("runReviewPass -- fails with a typed error when the file does not exist", async () => {
  const vfs = (await createFile("other.txt", "x")).vfs;
  const { env } = await setup();
  const { agent } = createSpyClient([]);

  await assertRejects(
    () =>
      runPass(env, {
        agent,
        vfs,
        pass: passFixture([unitFixture({ id: "analyze" })]),
        wsId: "ws",
        path: "essay.txt",
      }),
    ReviewFileMissingError,
    "File not found: essay.txt",
  );

  // No run row: nothing was reviewed, so there is nothing to report on.
  assertEquals(await viaRuns(env, (deps) => deps.runs.listRuns()), []);
});

Deno.test("runReviewPass -- heartbeats the lease while running, then releases it", async () => {
  const { vfs } = await createFile("essay.txt", "hello brave world");
  const kv = await Deno.openKv(":memory:");
  const count = { renewed: 0, refused: 0 };
  const env = countingReviews(kv, count);
  const { agent } = createSpyClient([
    { text: ANALYSIS_ROUND },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runPass(env, {
    agent,
    vfs,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assert(count.renewed >= 1);
  // A refused beat would mean the finish raced the release.
  assertEquals(count.refused, 0);
  const row = await viaRuns(env, (deps) => deps.runs.getRun(run.id));
  assertEquals(row?.leaseOwner, undefined);
  assertEquals(row?.heartbeatAt, undefined);
});

Deno.test("runReviewPass -- refuses to resume a run another driver holds", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { env } = await setup();
  const { agent } = createSpyClient([]);
  const run = await viaRuns(env, (deps) =>
    deps.runs.createRun({
      path: "essay.txt",
      reviewPassId: "essay-review",
      versionId: "v1",
    }),
  );
  await viaRuns(env, (deps) =>
    deps.runs.claimRun(run.id, { owner: "driver-x", heartbeatAtLeast: 0 }),
  );

  await assertRejects(
    () =>
      resumePass(
        env,
        {
          agent,
          vfs,
          pass: passFixture([unitFixture({ id: "analyze" })]),
          wsId: "ws",
          path: "essay.txt",
        },
        run.id,
      ),
    ReviewLeaseTakenError,
    `Run ${run.id} is claimed by another driver`,
  );
});

Deno.test("runReviewPass -- resumes a run whose lease went stale", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const { adapter, env } = await setup();
  const run = await viaRuns(env, (deps) =>
    deps.runs.createRun({
      path: "essay.txt",
      reviewPassId: "essay-review",
      versionId,
    }),
  );
  // A dead owner, its heartbeat far in the past.
  await adapter.set(["reviews", "ws", run.id], {
    ...run,
    leaseOwner: "driver-dead",
    heartbeatAt: 1,
  });
  const { agent } = createSpyClient([
    { text: ANALYSIS_ROUND },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const resumed = await resumePass(
    env,
    {
      agent,
      vfs,
      pass: passFixture([
        unitFixture({ id: "analyze" }),
        unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
      ]),
      wsId: "ws",
      path: "essay.txt",
    },
    run.id,
  );

  assertEquals(resumed.status, "completed");
});

/** Wraps the ReviewRuns service with heartbeat counters, backed by the same
 * KV store as the fixtures. */
function countingReviews(
  kv: Deno.Kv,
  count: { renewed: number; refused: number },
): Layer.Layer<ReviewRuns | TraceEvents> {
  const heartbeats = Layer.effect(
    ReviewRuns,
    Effect.gen(function* () {
      const base = yield* ReviewRuns;
      return ReviewRuns.of({
        ...base,
        heartbeatRun: (id: string, owner: string) =>
          Effect.gen(function* () {
            const held = yield* base.heartbeatRun(id, owner);
            if (held) count.renewed += 1;
            else count.refused += 1;
            return held;
          }),
      });
    }),
  );
  return Layer.merge(
    heartbeats,
    Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
  ).pipe(
    Layer.provide(Layer.provide(ReviewRuns.layerNoDeps, kvLayer(kv))),
    Layer.provide(kvLayer(kv)),
  );
}
