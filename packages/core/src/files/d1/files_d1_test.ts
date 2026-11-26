import { assertEquals, assertInstanceOf } from "@std/assert";
import { DateTime, Effect, Layer, Option, Result, Struct } from "effect";
import { test } from "vitest";

import { testLayerD1 } from "#/persistence/testing/d1.ts";
import { layerReviewRunsD1 } from "#/reviews/runs_d1.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

import { layerFilesD1 } from "./files_d1.ts";
import { Files } from "./service.ts";
import {
  FileExistsError,
  FileMissingError,
  FileTooLargeError,
  Mark,
  MAX_DOCUMENT_BYTES,
} from "./types.ts";

const layer = testLayerD1((client) =>
  Layer.mergeAll(layerFilesD1(client), layerWorkspacesD1(client), layerReviewRunsD1(client)),
);

/** Run a test program in a fresh workspace; `other` runs a program in a second one. */
const run = <A, E>(
  program: (
    other: <B, F>(effect: Effect.Effect<B, F, Files | WorkspaceId>) => Effect.Effect<B, F, Files>,
  ) => Effect.Effect<A, E, Files | ReviewRuns | WorkspaceId>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const owner = yield* workspaces.createUser({ email: "owner@example.com" });
      const workspace = yield* workspaces.createWorkspace("Essays", owner.id);
      const second = yield* workspaces.createWorkspace("Other", owner.id);
      const other = <B, F>(effect: Effect.Effect<B, F, Files | WorkspaceId>) =>
        Effect.provideService(effect, WorkspaceId, { wsId: second.id });
      return yield* Effect.provideService(program(other), WorkspaceId, { wsId: workspace.id });
    }).pipe(Effect.provide(layer)),
  );

const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.result(effect).pipe(
    Effect.map((outcome) => (Result.isFailure(outcome) ? outcome.failure : undefined)),
  );

/** Every mark needs a review run; a test makes one and uses it for all its marks. */
const reviewRun = (versionId: string) =>
  Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    return (yield* runs.createRun({ path: "essay.md", versionId, reviewPassId: "pass" })).id;
  });

/** A mark on `text` within `content`. */
const markOn = (runId: string, versionId: string, content: string, text: string) =>
  Effect.gen(function* () {
    const threadId = text;
    const offset = content.indexOf(text);
    return new Mark({
      id: `mark-${threadId}`,
      versionId,
      runId,
      unitId: "unit",
      threadId,
      categoryId: Option.none(),
      selectedText: text,
      beforeContext: content.slice(Math.max(0, offset - 10), offset),
      afterContext: content.slice(offset + text.length, offset + text.length + 10),
      comment: `about ${text}`,
      createdAt: yield* DateTime.now,
      offset,
      length: text.length,
      status: "resolved",
    });
  });

test("Files -- create, resolve, list and read", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.create("essay.md", "first draft");
      assertEquals(version.seq, 1);
      assertEquals((yield* files.resolve("essay.md")).id, file.id);

      yield* files.create("notes/a.md", "a");
      const listed = yield* files.list();
      assertEquals(
        listed.map((entry) => entry.file.path),
        ["essay.md", "notes/a.md"],
      );
      assertEquals(
        (yield* files.list("notes/")).map((entry) => entry.file.path),
        ["notes/a.md"],
      );

      const snapshot = yield* files.read(file.id);
      assertEquals(snapshot.content, "first draft");
      assertEquals(snapshot.id, version.id);
    }),
  );
});

test("Files -- a taken path cannot be created again", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.create("essay.md", "one");
      assertInstanceOf(yield* failure(files.create("essay.md", "two")), FileExistsError);
    }),
  );
});

test("Files -- missing files and versions", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      assertInstanceOf(yield* failure(files.resolve("nope.md")), FileMissingError);
      assertInstanceOf(yield* failure(files.read("nope")), FileMissingError);
      const { file } = yield* files.create("essay.md", "one");
      assertInstanceOf(yield* failure(files.read(file.id, "nope")), FileMissingError);
    }),
  );
});

test("Files -- write adds numbered versions", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version: first } = yield* files.create("essay.md", "one");
      const second = yield* files.write(file.id, "two");
      const third = yield* files.write(file.id, "three");
      assertEquals([second.seq, third.seq], [2, 3]);
      assertEquals(
        (yield* files.versions(file.id)).map((version) => version.id),
        [first.id, second.id, third.id],
      );
      assertEquals((yield* files.read(file.id)).content, "three");
      assertEquals((yield* files.read(file.id, first.id)).content, "one");
      assertEquals(
        (yield* files.list()).map(({ latest }) => latest.id),
        [third.id],
      );
    }),
  );
});

test("Files -- concurrent writes all land, one version each", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file } = yield* files.create("essay.md", "zero");
      const written = yield* Effect.all(
        ["a", "b", "c"].map((content) => files.write(file.id, content)),
        { concurrency: "unbounded" },
      );
      assertEquals(
        written.map((version) => version.seq).toSorted((a, b) => a - b),
        [2, 3, 4],
      );
    }),
  );
});

test("Files -- content over the cap is refused", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const big = "x".repeat(MAX_DOCUMENT_BYTES + 1);
      assertInstanceOf(yield* failure(files.create("big.md", big)), FileTooLargeError);
      const { file } = yield* files.create("essay.md", "small");
      assertInstanceOf(yield* failure(files.write(file.id, big)), FileTooLargeError);
      assertInstanceOf(yield* failure(files.writeDraft(file.id, big)), FileTooLargeError);
    }),
  );
});

test("Files -- a draft is promoted into a version and cleared", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.create("essay.md", "one");
      assertEquals(yield* files.promoteDraft(file.id), { version, promoted: false });

      yield* files.writeDraft(file.id, "one, edited");
      const draft = yield* files.readDraft(file.id);
      assertEquals(
        Option.map(draft, (d) => d.content),
        Option.some("one, edited"),
      );

      const promoted = yield* files.promoteDraft(file.id);
      assertEquals(promoted.promoted, true);
      assertEquals(promoted.version.seq, 2);
      assertEquals((yield* files.read(file.id)).content, "one, edited");
      assertEquals(yield* files.readDraft(file.id), Option.none());
    }),
  );
});

test("Files -- a draft on an older version reads as none", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file } = yield* files.create("essay.md", "one");
      yield* files.writeDraft(file.id, "draft");
      yield* files.write(file.id, "two");
      assertEquals(yield* files.readDraft(file.id), Option.none());
    }),
  );
});

test("Files -- write migrates marks onto the new version", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const content = "The quick brown fox jumps over the lazy dog.";
      const { file, version } = yield* files.create("essay.md", content);
      const runId = yield* reviewRun(version.id);
      yield* files.addMark(yield* markOn(runId, version.id, content, "quick brown"));
      yield* files.addMark(yield* markOn(runId, version.id, content, "lazy dog"));

      const next = yield* files.write(file.id, "The quick brown fox sleeps.");
      const migrated = yield* files.marks(next.id);
      const byThread = new Map(migrated.map((mark) => [mark.threadId, mark]));
      assertEquals(byThread.get("quick brown")?.status, "resolved");
      assertEquals(byThread.get("lazy dog")?.status, "stale");
      assertEquals(
        migrated.every((mark) => mark.versionId === next.id && !mark.id.startsWith("mark-")),
        true,
      );
      assertEquals((yield* files.marks(version.id)).length, 2);
    }),
  );
});

test("Files -- many marks are migrated in several statements", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
      const content = words.join(" ");
      const { file, version } = yield* files.create("essay.md", content);
      const runId = yield* reviewRun(version.id);
      for (const word of words)
        yield* files.addMark(yield* markOn(runId, version.id, content, word));
      const next = yield* files.write(file.id, `${content} end`);
      assertEquals((yield* files.marks(next.id)).length, words.length);
    }),
  );
});

test("Files -- migrateMarks copies new threads of an older version onto the latest", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const content = "alpha beta gamma";
      const { file, version: first } = yield* files.create("essay.md", content);
      yield* files.write(file.id, content);
      // a review of the first version lands after the second was saved
      const runId = yield* reviewRun(first.id);
      yield* files.addMark(yield* markOn(runId, first.id, content, "beta"));

      assertEquals(yield* files.migrateMarks(file.id, first.id), { migrated: 1, stale: 0 });
      // the thread is on the latest now, so a second migration skips it
      assertEquals(yield* files.migrateMarks(file.id, first.id), { migrated: 0, stale: 0 });
      const latest = yield* files.read(file.id);
      assertEquals(yield* files.migrateMarks(file.id, latest.id), { migrated: 0, stale: 0 });
    }),
  );
});

test("Files -- a file of another workspace reads as missing", async () => {
  await run((other) =>
    Effect.gen(function* () {
      const files = yield* Files;
      const content = "alpha beta";
      const { file, version } = yield* files.create("essay.md", content);
      const runId = yield* reviewRun(version.id);
      yield* files.addMark(yield* markOn(runId, version.id, content, "beta"));

      assertInstanceOf(yield* other(failure(files.read(file.id))), FileMissingError);
      assertInstanceOf(yield* other(failure(files.write(file.id, "x"))), FileMissingError);
      assertEquals(yield* other(files.marks(version.id)), []);
      assertEquals((yield* files.marks(version.id)).length, 1);
    }),
  );
});

test("Files -- a mark on a missing version is refused", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const content = "alpha beta";
      const { version } = yield* files.create("essay.md", content);
      const runId = yield* reviewRun(version.id);
      const mark = yield* markOn(runId, version.id, content, "beta");
      assertInstanceOf(
        yield* failure(
          files.addMark(new Mark({ ...Struct.omit(mark, ["versionId"]), versionId: "nope" })),
        ),
        FileMissingError,
      );
    }),
  );
});

test("Files -- promoting a draft a save made stale writes nothing", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file } = yield* files.create("essay.md", "one");
      yield* files.writeDraft(file.id, "draft on one");
      const saved = yield* files.write(file.id, "two, from another tab");
      const promoted = yield* files.promoteDraft(file.id);
      assertEquals(promoted, { version: saved, promoted: false });
      assertEquals((yield* files.read(file.id)).content, "two, from another tab");
    }),
  );
});
