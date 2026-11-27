import type { DatabaseSync } from "node:sqlite";

import type * as D1Client from "@effect/sql-d1/D1Client";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { type Context, Effect, Layer, Option } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import { test } from "vitest";

import { category, reviewPass } from "#/config/testing.ts";
import type { ResolvedReviewPass, ReviewUnit } from "#/config/types.ts";
import { type CoreServices, layerCoreD1 } from "#/d1/layer.ts";
import { Files } from "#/files/service.ts";
import type { NodeRun } from "#/flow/types.ts";
import { Marks } from "#/marks/service.ts";
import { createFakeClient } from "#/model/fake_client.ts";
import { ModelClient } from "#/model/service.ts";
import { noopObserver } from "#/reviews/observer/noop.ts";
import type { ReviewObserver } from "#/reviews/observer/types.ts";
import { ReviewPacing } from "#/reviews/pacing.ts";
import { ReviewLeaseTakenError, resumeReviewRun } from "#/reviews/runner.ts";
import { layerReviewRunsD1 } from "#/reviews/runs_d1.ts";
import { ReviewRunMissingError, ReviewRuns } from "#/reviews/service.ts";
import { openReviewDatabase } from "#/reviews/testing.ts";
import { TraceEvents } from "#/reviews/trace/service.ts";
import type { TraceEvent } from "#/reviews/trace/types.ts";
import type { ReviewRun } from "#/reviews/types.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

function unitFixture(partial: Partial<ReviewUnit> & Pick<ReviewUnit, "id">): ReviewUnit {
  return { promptKey: "dir", ...partial };
}

function passFixture(units: ReviewUnit[]): ResolvedReviewPass {
  return {
    pass: reviewPass({
      id: "essay-review",
      name: "Essay review",
      systemPromptKey: "sys",
      modelPoolId: "pool",
      units,
    }),
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
          categories: [category({ id: "grammar", label: "grammar" })],
          repairRounds: unit.attempt.repairRounds ?? 1,
        },
      }),
      ...(unit.summary && { summary: true }),
    })),
  };
}

type Env = Layer.Layer<ModelClient | CoreServices>;

/** A database for a single test, with a file at its first version. */
interface Setup {
  db: DatabaseSync;
  client: D1Client.D1Client & SqlClient;
  env: Layer.Layer<CoreServices>;
  wsId: string;
  fileId: string;
  versionId: string;
}

async function setup(content: string): Promise<Setup> {
  const { db, client, env, wsId } = await openReviewDatabase();
  const { file, version } = await Effect.runPromise(
    Files.use((files) => files.createAt("essay.md", content)).pipe(
      Effect.provideService(WorkspaceId, { wsId }),
      Effect.provide(env),
    ),
  );
  return { db, client, env, wsId, fileId: file.id, versionId: version.id };
}

const PACING = { heartbeatMs: 50, staleMs: 500, retryMs: 500 };

const inWorkspace = <A, E>(
  { wsId }: Setup,
  env: Env,
  effect: Effect.Effect<A, E, ModelClient | CoreServices | ReviewPacing | WorkspaceId>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(WorkspaceId, { wsId }),
      Effect.provideService(ReviewPacing, PACING),
      Effect.provide(env),
    ),
  );

/** Run a small program against the database of the test, with the review services passed in. */
function viaRuns<A>(
  fixture: Setup,
  env: Env,
  body: (deps: {
    runs: Context.Service.Shape<typeof ReviewRuns>;
    traces: Context.Service.Shape<typeof TraceEvents>;
    marks: Context.Service.Shape<typeof Marks>;
  }) => Effect.Effect<A, unknown, WorkspaceId>,
): Promise<A> {
  return inWorkspace(
    fixture,
    env,
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const traces = yield* TraceEvents;
      const marks = yield* Marks;
      return yield* body({ runs, traces, marks });
    }),
  );
}

const createRun = (fixture: Setup) =>
  ReviewRuns.use((runs) =>
    runs.createRun({
      fileId: fixture.fileId,
      versionId: fixture.versionId,
      reviewPassId: "essay-review",
    }),
  );

/** Create the run like production does, then drive it with resumeReviewRun. */
const startRun = (fixture: Setup, env: Env, pass: ResolvedReviewPass): Promise<ReviewRun> =>
  inWorkspace(
    fixture,
    env,
    Effect.gen(function* () {
      const run = yield* createRun(fixture);
      return yield* resumeReviewRun(pass, run.id, noopObserver);
    }),
  );

const resumeRun = (
  fixture: Setup,
  env: Env,
  pass: ResolvedReviewPass,
  runId: string,
): Promise<ReviewRun> => inWorkspace(fixture, env, resumeReviewRun(pass, runId, noopObserver));

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

/** Per-node event type sequences; cross-node order varies with the
 * scheduler, per-node order is fixed. Custom events carry the host event's type. */
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
    event.type === "custom" && event.event.type === "applied" ? [event.event] : [],
  );
}

test("resumeReviewRun -- completes a pass with marks, summary, and a per-node trace", async () => {
  const fixture = await setup("hello brave world");
  const { client, inputs } = createFakeClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selectedText":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
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
  );

  assertEquals(run.status, "completed");
  assertEquals(run.summary, Option.some("Solid draft."));

  const marks = await viaRuns(fixture, env, (deps) => deps.marks.ofRun(run.id));
  assertEquals(marks[0].selectedText, "brave");
  assertEquals(marks[0].runId, run.id);

  const trace = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    analyze: ["node_start", "prompt", "model_call", "reasoning", "output", "node_end"],
    "mechanics.propose": ["node_start", "prompt", "model_call", "output", "node_end"],
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

test("resumeReviewRun -- a repair round re-quotes the failed spans", async () => {
  const fixture = await setup("hello world");
  const { client, inputs } = createFakeClient([
    {
      text: '{"marks":[{"selectedText":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selectedText":"hello","comment":"found it","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
  );

  assertEquals(run.status, "completed");
  assertEquals(run.summary, Option.some("Solid draft."));

  const trace = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    "mechanics.propose": ["node_start", "prompt", "model_call", "output", "node_end"],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.collect": ["node_start", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": ["node_start", "prompt", "model_call", "output", "node_end"],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    summary: ["node_start", "prompt", "model_call", "output", "node_end"],
  });
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  assertEquals(applied[1].attempts[0].marked, true);
  // The repair prompt quotes the failed span and its surroundings.
  assertEquals(inputs[1].includes('Attempted span: "ghost span"'), true);
  const marks = await viaRuns(fixture, env, (deps) => deps.marks.ofRun(run.id));
  assertEquals(marks[0].selectedText, "hello");
});

test("resumeReviewRun -- a zero budget keeps failed marks with no repair nodes", async () => {
  const fixture = await setup("hello world");
  const { client } = createFakeClient([
    {
      text: '{"marks":[{"selectedText":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 0 },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
  );

  assertEquals(run.status, "completed");
  const trace = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  assertEquals(Object.keys(byNode(trace)), [
    "content",
    "mechanics.propose",
    "mechanics.apply",
    "mechanics.collect",
    "summary",
  ]);
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  const marks = await viaRuns(fixture, env, (deps) => deps.marks.ofRun(run.id));
  assertEquals(marks, []);
});

test("resumeReviewRun -- resuming a run that does not exist is an error", async () => {
  const fixture = await setup("hello world");
  const { client } = createFakeClient([{ text: ANALYSIS_ROUND }]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  await assertRejects(
    () => resumeRun(fixture, env, passFixture([unitFixture({ id: "analyze" })]), "no-such-run"),
    ReviewRunMissingError,
    "No run no-such-run",
  );
});

test("resumeReviewRun -- a resumed pass skips completed nodes and shows each once", async () => {
  const fixture = await setup("hello brave world");
  // First attempt: analyze succeeds, then the unit below it fails on bad JSON.
  const first = createFakeClient([{ text: ANALYSIS_ROUND }, { text: "not json" }]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(first.client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
  );

  assertEquals(run.status, "failed");
  const interrupted = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  // analyze completed, so its artifacts are recoverable from the trace.
  assertEquals(nodeEnd(interrupted, "analyze")?.status, "completed");
  // as if the first driver had stopped before settling the run, which stays running
  fixture.db
    .prepare(
      "UPDATE review_runs SET status = 'running', completedAt = NULL, error = NULL WHERE id = ?",
    )
    .run(run.id);

  // Second attempt over the same run: the fold supplies analyze's artifacts, so only the failed
  // unit is scheduled.
  const second = createFakeClient([
    {
      text: '{"marks":[{"selectedText":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const resumeEnv = Layer.merge(fixture.env, ModelClient.layerOf(second.client));
  const resumed = await resumeRun(
    fixture,
    resumeEnv,
    passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    run.id,
  );

  assertEquals(resumed.status, "completed");
  // The resumed attempt did not re-run analyze.
  assertEquals(second.inputs.length, 2);
  assertEquals(second.inputs[0].includes("Good."), false);

  const trace = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  const analyzeEvents = byNode(trace).analyze;
  assertEquals(analyzeEvents.filter((type) => type === "node_start").length, 1);
  assertEquals(analyzeEvents.filter((type) => type === "node_end").length, 1);
  // the first attempt placed no mark, so the only one is from the retry
  const marks = await viaRuns(fixture, env, (deps) => deps.marks.ofRun(run.id));
  assertEquals(marks[0]?.selectedText, "brave");
});

test("resumeReviewRun -- a node error fails the run and skips dependents", async () => {
  const fixture = await setup("hello world");
  const { client } = createFakeClient([{ text: "not json" }]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
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
  );

  assertEquals(run.status, "failed");
  assertEquals(Option.getOrUndefined(run.error)?.includes("not valid JSON"), true);

  const trace = (await viaRuns(fixture, env, (deps) => deps.traces.get(run.id))) ?? [];
  const grouped = byNode(trace);
  // The prompt is recorded before each call, the repair says why the first reply was rejected, and
  // the re-ask that also failed leaves two model_call events with a repair between them.
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

test("resumeReviewRun -- fails a pass that commits no summary", async () => {
  const fixture = await setup("hello world");
  const { client } = createFakeClient([{ text: ANALYSIS_ROUND }]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    // No summary unit, so the graph commits no summary artifact. Reading it back is a structural
    // surprise, not a pass with a blank summary.
    passFixture([unitFixture({ id: "analyze" })]),
  );

  assertEquals(run.status, "failed");
  assertEquals(Option.getOrUndefined(run.error)?.includes("no summary artifact"), true);
  assertEquals(run.summary, Option.none());
});

test("resumeReviewRun -- heartbeats the lease while running, then releases it", async () => {
  const fixture = await setup("hello brave world");
  const count = { renewed: 0, refused: 0 };
  const { client } = createFakeClient([
    { text: ANALYSIS_ROUND },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(countingReviews(fixture.client, count), ModelClient.layerOf(client));

  const run = await startRun(
    fixture,
    env,
    passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
    ]),
  );

  assertEquals(run.status, "completed");
  assert(count.renewed >= 1);
  // A refused heartbeat would mean the finish raced the release.
  assertEquals(count.refused, 0);
  const row = await viaRuns(fixture, env, (deps) => deps.runs.getRun(run.id));
  assertEquals(row.leaseOwner, Option.none());
  assertEquals(row.heartbeatAt, Option.none());
});

test("resumeReviewRun -- an observer sees the trace and the settled run", async () => {
  const fixture = await setup("hello brave world");
  const env = Layer.merge(
    fixture.env,
    ModelClient.layerOf(
      createFakeClient([{ text: ANALYSIS_ROUND }, { text: '{"summary":"Solid draft."}' }]).client,
    ),
  );

  const traced: number[] = [];
  const settled: ReviewRun[] = [];
  const observer: ReviewObserver = {
    onTrace: (event) => Effect.sync(() => traced.push(event.seq)),
    onSettled: (run) => Effect.sync(() => settled.push(run)),
  };

  const run = await inWorkspace(
    fixture,
    env,
    Effect.gen(function* () {
      const created = yield* createRun(fixture);
      return yield* resumeReviewRun(
        passFixture([
          unitFixture({ id: "analyze" }),
          unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
        ]),
        created.id,
        observer,
      );
    }),
  );

  assertEquals(run.status, "completed");
  assert(traced.length > 0);
  assertEquals(settled.length, 1);
  assertEquals(settled[0].id, run.id);
  assertEquals(settled[0].status, "completed");
});

test("resumeReviewRun -- refuses to resume a run another driver holds", async () => {
  const fixture = await setup("hello world");
  const { client } = createFakeClient([]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));
  const run = await inWorkspace(fixture, env, createRun(fixture));
  await viaRuns(fixture, env, (deps) =>
    deps.runs.claimRun(run.id, { owner: "driver-x", staleMs: 60_000 }),
  );

  await assertRejects(
    () => resumeRun(fixture, env, passFixture([unitFixture({ id: "analyze" })]), run.id),
    ReviewLeaseTakenError,
    `Run ${run.id} is claimed by another driver`,
  );
});

test("resumeReviewRun -- resumes a run whose lease went stale", async () => {
  const fixture = await setup("hello brave world");
  const { client } = createFakeClient([
    { text: ANALYSIS_ROUND },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));
  const run = await inWorkspace(fixture, env, createRun(fixture));
  // A dead owner, its heartbeat far in the past.
  fixture.db
    .prepare(
      `UPDATE review_runs SET leaseOwner = 'driver-dead', heartbeatAt = '2000-01-01T00:00:00.000Z'
        WHERE id = ?`,
    )
    .run(run.id);

  const resumed = await resumeRun(
    fixture,
    env,
    passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
    ]),
    run.id,
  );

  assertEquals(resumed.status, "completed");
});

/** The review services, counting the heartbeats of ReviewRuns. */
function countingReviews(
  client: D1Client.D1Client & SqlClient,
  count: { renewed: number; refused: number },
): Layer.Layer<CoreServices> {
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
  return Layer.merge(layerCoreD1(client), Layer.provide(heartbeats, layerReviewRunsD1(client)));
}
