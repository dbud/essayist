import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { test } from "vitest";

import { ReviewConfig } from "#/config/service.ts";
import { reviewPass } from "#/config/testing.ts";
import { ModelPool, Prompt } from "#/config/types.ts";

import { loadProgressFeed } from "./progress_feed.ts";
import { reviewedFile, runInWorkspace } from "./testing.ts";
import { TraceEvents } from "./trace/service.ts";

/** A running review with a trace of a started unit and a placed mark. */
const tracedRun = Effect.gen(function* () {
  const { run } = yield* reviewedFile();
  const traces = yield* TraceEvents;
  yield* traces.append(run.id, { seq: 0, at: 0, type: "node_start", nodeId: "analyze" });
  yield* traces.append(run.id, {
    seq: 1,
    at: 1,
    type: "custom",
    nodeId: "mechanics.apply",
    event: {
      type: "applied",
      attempts: [{ selectedText: "a", comment: "c", marked: true, markId: "m" }],
    },
  });
  return run;
});

test("loadProgressFeed -- folds the stored trace over the units of its pass", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveModelPool(new ModelPool({ id: "pool", name: "Pool", models: ["m/a"] }));
      yield* config.savePrompt(new Prompt({ key: "system", body: "You are an editor." }));
      yield* config.savePrompt(new Prompt({ key: "analyze", body: "Read it." }));
      yield* config.saveReviewPass(
        reviewPass({
          id: "essay-review",
          name: "Pass",
          systemPromptKey: "system",
          modelPoolId: "pool",
          units: [{ id: "analyze", promptKey: "analyze" }],
        }),
      );
      const run = yield* tracedRun;

      const feed = yield* loadProgressFeed(run);
      assertEquals(feed.seq, 1);
      assertEquals(feed.progress, {
        units: [{ id: "analyze", state: "running" }],
        marksPlaced: 1,
      });
    }),
  );
});

test("loadProgressFeed -- a missing pass leaves no units, marks still count", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const run = yield* tracedRun;
      const feed = yield* loadProgressFeed({ id: run.id, reviewPassId: "gone" });
      assertEquals(feed.progress, { units: [], marksPlaced: 1 });
    }),
  );
});
