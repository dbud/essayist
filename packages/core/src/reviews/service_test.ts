import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { DateTime, Duration, Effect, Option } from "effect";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { Files } from "#/files/service.ts";
import { FileMissingError } from "#/files/types.ts";
import { Marks } from "#/marks/service.ts";

import { ReviewRunActiveError, ReviewRunMissingError, ReviewRuns } from "./service.ts";
import { reviewedFile, runInWorkspace } from "./testing.ts";
import { TraceEvents } from "./trace/service.ts";

const lease = (owner: string) => ({ owner, staleMs: 60_000 });

/** Save a second version of essay.md. */
const writeAgain = Files.use((files) => files.writeAt("essay.md", "hello again")).pipe(
  Effect.map(({ version }) => version.id),
);

test("ReviewRuns -- createRun starts a running run that getRun reads back", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const { file, version, run } = yield* reviewedFile();
      assertEquals(run.status, "running");
      assertEquals([run.fileId, run.versionId], [file.id, version.id]);
      assertEquals(run.completedAt, Option.none());
      const fetched = yield* ReviewRuns.use((runs) => runs.getRun(run.id));
      assertEquals(fetched, run);
    }),
  );
});

test("ReviewRuns.createRun -- a version outside the workspace fails as missing", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const { file, version, run } = yield* reviewedFile();
      yield* ReviewRuns.use((runs) => runs.failRun(run.id, "done"));
      const input = { fileId: file.id, versionId: version.id, reviewPassId: "pass" };
      const error = yield* Effect.flip(other(ReviewRuns.use((runs) => runs.createRun(input))));
      assertInstanceOf(error, FileMissingError);
      const unknown = { ...input, versionId: "nope" };
      assertInstanceOf(
        yield* Effect.flip(ReviewRuns.use((runs) => runs.createRun(unknown))),
        FileMissingError,
      );
    }),
  );
});

test("ReviewRuns.createRun -- refuses a second running run on a file, naming it", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const { file, version, run } = yield* reviewedFile();
      const error = yield* Effect.flip(
        ReviewRuns.use((runs) =>
          runs.createRun({ fileId: file.id, versionId: version.id, reviewPassId: "pass" }),
        ),
      );
      assertInstanceOf(error, ReviewRunActiveError);
      assertEquals(error.runId, run.id);
    }),
  );
});

test("ReviewRuns.createRun -- another file, or the same file once settled, can start", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const first = yield* reviewedFile("a", "a.md");
      yield* reviewedFile("b", "b.md");
      yield* runs.failRun(first.run.id, "boom");
      const again = yield* runs.createRun({
        fileId: first.file.id,
        versionId: first.version.id,
        reviewPassId: "pass",
      });
      assertEquals(again.status, "running");
    }),
  );
});

test("ReviewRuns.listRuns -- newest first, by file, within the workspace", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* reviewedFile("a", "a.md");
      yield* TestClock.adjust(Duration.seconds(1));
      const b = yield* reviewedFile("b", "b.md");
      assertEquals(
        (yield* runs.listRuns()).map((run) => run.id),
        [b.run.id, a.run.id],
      );
      assertEquals(
        (yield* runs.listRuns(a.file.id)).map((run) => run.id),
        [a.run.id],
      );
      assertEquals(yield* other(runs.listRuns()), []);
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test("ReviewRuns -- completeRun and failRun settle the run", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* reviewedFile("a", "a.md");
      const b = yield* reviewedFile("b", "b.md");
      const completed = yield* runs.completeRun(a.run.id, "Good draft.");
      assertEquals(completed.status, "completed");
      assertEquals(completed.summary, Option.some("Good draft."));
      assert(Option.isSome(completed.completedAt));
      const failed = yield* runs.failRun(b.run.id, "boom");
      assertEquals([failed.status, failed.error], ["failed", Option.some("boom")]);
    }),
  );
});

test("ReviewRuns -- an unknown run, or one in another workspace, is missing", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { run } = yield* reviewedFile();
      for (const effect of [
        runs.getRun("nope"),
        runs.completeRun("nope", "ok"),
        runs.failRun("nope", "boom"),
        other(runs.getRun(run.id)),
        other(runs.failRun(run.id, "boom")),
      ]) {
        assertInstanceOf(yield* Effect.flip(effect), ReviewRunMissingError);
      }
    }),
  );
});

test("ReviewRuns.claimRun -- leases a running run, not one elsewhere or settled", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* reviewedFile("a", "a.md");
      const claimed = yield* runs.claimRun(a.run.id, lease("driver-a"));
      assertEquals(
        Option.map(claimed, (run) => run.leaseOwner),
        Option.some(Option.some("driver-a")),
      );
      assertEquals(yield* other(runs.claimRun(a.run.id, lease("driver-b"))), Option.none());
      assertEquals(yield* runs.claimRun("nope", lease("driver-a")), Option.none());

      const b = yield* reviewedFile("b", "b.md");
      yield* runs.completeRun(b.run.id, "ok");
      assertEquals(yield* runs.claimRun(b.run.id, lease("driver-a")), Option.none());
    }),
  );
});

test("ReviewRuns.claimRun -- a live lease holds, and goes stale with the clock", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { run } = yield* reviewedFile();
      yield* runs.claimRun(run.id, lease("driver-a"));
      assertEquals(yield* runs.claimRun(run.id, lease("driver-b")), Option.none());
      // the owner may claim again, which renews
      assert(Option.isSome(yield* runs.claimRun(run.id, lease("driver-a"))));

      yield* TestClock.adjust(Duration.minutes(2));
      const takeover = yield* runs.claimRun(run.id, lease("driver-b"));
      assertEquals(
        Option.map(takeover, (claimed) => claimed.leaseOwner),
        Option.some(Option.some("driver-b")),
      );
      assertEquals(
        Option.flatMap(takeover, (claimed) => claimed.heartbeatAt).pipe(
          Option.map(DateTime.toEpochMillis),
        ),
        Option.some(DateTime.toEpochMillis(yield* DateTime.now)),
      );
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test("ReviewRuns.heartbeatRun -- renews only the lease of its owner", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { run } = yield* reviewedFile();
      assertEquals(yield* runs.heartbeatRun(run.id, "driver-a"), false);
      yield* runs.claimRun(run.id, lease("driver-a"));
      assertEquals(yield* runs.heartbeatRun(run.id, "driver-a"), true);
      assertEquals(yield* runs.heartbeatRun(run.id, "driver-b"), false);
      assertEquals(yield* runs.heartbeatRun("nope", "driver-a"), false);
    }),
  );
});

test("ReviewRuns -- settling a run releases its lease", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* reviewedFile("a", "a.md");
      const b = yield* reviewedFile("b", "b.md");
      yield* runs.claimRun(a.run.id, lease("driver-a"));
      yield* runs.claimRun(b.run.id, lease("driver-a"));
      for (const settled of [
        yield* runs.completeRun(a.run.id, "ok"),
        yield* runs.failRun(b.run.id, "boom"),
      ]) {
        assertEquals([settled.leaseOwner, settled.heartbeatAt], [Option.none(), Option.none()]);
      }
    }),
  );
});

test("ReviewRuns.deleteRun -- deletes the run with its trace and marks", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { file, version, run } = yield* reviewedFile();
      yield* Marks.use((marks) =>
        marks.mark({
          fileId: file.id,
          versionId: version.id,
          runId: run.id,
          selectedText: "hello",
          comment: "a note",
        }),
      );
      yield* TraceEvents.use((traces) =>
        traces.append(run.id, { seq: 0, at: 0, type: "node_start", nodeId: "content" }),
      );
      yield* runs.completeRun(run.id, "ok");

      yield* runs.deleteRun(run.id);
      assertInstanceOf(yield* Effect.flip(runs.getRun(run.id)), ReviewRunMissingError);
      assertEquals(yield* Marks.use((marks) => marks.ofRun(run.id)), []);
      assertEquals(yield* TraceEvents.use((traces) => traces.get(run.id)), []);
      assertInstanceOf(yield* Effect.flip(runs.deleteRun(run.id)), ReviewRunMissingError);
    }),
  );
});

test("ReviewRuns.deleteRun -- refuses a running run", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { run } = yield* reviewedFile();
      assertInstanceOf(yield* Effect.flip(runs.deleteRun(run.id)), ReviewRunActiveError);
      assertEquals((yield* runs.getRun(run.id)).status, "running");
    }),
  );
});

test("ReviewRuns.deleteRuns -- deletes the runs of a file, or of a single version", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { file, version, run: first } = yield* reviewedFile();
      yield* runs.completeRun(first.id, "ok");
      const second = yield* writeAgain;
      const later = yield* runs.createRun({
        fileId: file.id,
        versionId: second,
        reviewPassId: "p",
      });
      yield* runs.completeRun(later.id, "ok");
      const elsewhere = yield* reviewedFile("b", "b.md");

      assertEquals(yield* runs.deleteRuns(file.id, version.id), 1);
      assertEquals(
        (yield* runs.listRuns(file.id)).map((run) => run.id),
        [later.id],
      );
      assertEquals(yield* runs.deleteRuns(file.id), 1);
      assertEquals(yield* runs.listRuns(file.id), []);
      assertEquals(
        (yield* runs.listRuns()).map((run) => run.id),
        [elsewhere.run.id],
      );
    }),
  );
});

test("ReviewRuns.deleteRuns -- a running run in scope refuses and deletes nothing", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { file, version, run: first } = yield* reviewedFile();
      yield* runs.completeRun(first.id, "ok");
      const second = yield* writeAgain;
      const running = yield* runs.createRun({
        fileId: file.id,
        versionId: second,
        reviewPassId: "p",
      });

      const error = yield* Effect.flip(runs.deleteRuns(file.id));
      assertInstanceOf(error, ReviewRunActiveError);
      assertEquals(error.runId, running.id);
      assertEquals((yield* runs.listRuns(file.id)).length, 2);
      // the running run is on another version, so the first version can still be cleared
      assertEquals(yield* runs.deleteRuns(file.id, version.id), 1);
    }),
  );
});
