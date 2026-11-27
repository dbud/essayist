import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Layer, Option, Result } from "effect";
import { test } from "vitest";

import { testLayerD1 } from "#/d1/testing.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

import { layerFilesD1 } from "./files_d1.ts";
import { Files } from "./service.ts";
import {
  DraftStaleError,
  FileExistsError,
  FileMissingError,
  FileTooLargeError,
  MAX_DOCUMENT_BYTES,
} from "./types.ts";

const layer = testLayerD1((client) =>
  Layer.mergeAll(layerFilesD1(client), layerWorkspacesD1(client)),
);

/** Run a test program in a fresh workspace; `other` runs a program in a second one. */
const run = <A, E>(
  program: (
    other: <B, F>(effect: Effect.Effect<B, F, Files | WorkspaceId>) => Effect.Effect<B, F, Files>,
  ) => Effect.Effect<A, E, Files | WorkspaceId>,
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

test("Files -- create, find by path, list and read", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.createAt("essay.md", "first draft");
      assertEquals(version.seq, 1);
      assertEquals((yield* files.fileAt("essay.md")).id, file.id);

      yield* files.createAt("notes/a.md", "a");
      const listed = yield* files.list();
      assertEquals(
        listed.map((entry) => entry.file.path),
        ["essay.md", "notes/a.md"],
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
      yield* files.createAt("essay.md", "one");
      assertInstanceOf(yield* failure(files.createAt("essay.md", "two")), FileExistsError);
    }),
  );
});

test("Files -- missing files and versions", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      assertInstanceOf(yield* failure(files.fileAt("nope.md")), FileMissingError);
      assertInstanceOf(yield* failure(files.read("nope")), FileMissingError);
      const { file } = yield* files.createAt("essay.md", "one");
      assertInstanceOf(yield* failure(files.read(file.id, "nope")), FileMissingError);
    }),
  );
});

test("Files -- writeAt adds numbered versions to an existing file", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version: first } = yield* files.createAt("essay.md", "one");
      const { version: second } = yield* files.writeAt("essay.md", "two");
      const { version: third } = yield* files.writeAt("essay.md", "three");
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

test("Files -- concurrent writeAt to an existing file gets consecutive versions", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.createAt("essay.md", "zero");
      const written = yield* Effect.all(
        ["a", "b", "c"].map((content) => files.writeAt("essay.md", content)),
        { concurrency: "unbounded" },
      );
      assertEquals(
        written.map(({ version }) => version.seq).toSorted((a, b) => a - b),
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
      assertInstanceOf(yield* failure(files.createAt("big.md", big)), FileTooLargeError);
      const { file, version } = yield* files.createAt("essay.md", "small");
      assertInstanceOf(yield* failure(files.writeAt("essay.md", big)), FileTooLargeError);
      assertInstanceOf(
        yield* failure(files.writeDraft(file.id, version.id, big)),
        FileTooLargeError,
      );
    }),
  );
});

test("Files -- a draft is promoted into a version and cleared", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.createAt("essay.md", "one");
      assertEquals(yield* files.promoteDraft(file.id), { version, promoted: false });

      yield* files.writeDraft(file.id, version.id, "one, edited");
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

test("Files -- saving a version clears the draft", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.createAt("essay.md", "one");
      yield* files.writeDraft(file.id, version.id, "draft");
      yield* files.writeAt("essay.md", "two");
      assertEquals(yield* files.readDraft(file.id), Option.none());
    }),
  );
});

test("Files -- a file of another workspace reads as missing", async () => {
  await run((other) =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file } = yield* files.createAt("essay.md", "alpha beta");
      assertInstanceOf(yield* other(failure(files.read(file.id))), FileMissingError);
      assertInstanceOf(yield* other(failure(files.versions(file.id))), FileMissingError);
      assertInstanceOf(yield* other(failure(files.fileAt("essay.md"))), FileMissingError);
    }),
  );
});

test("Files -- after a save there is no draft left to promote", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.createAt("essay.md", "one");
      yield* files.writeDraft(file.id, version.id, "draft on one");
      const { version: saved } = yield* files.writeAt("essay.md", "two, from another tab");
      const promoted = yield* files.promoteDraft(file.id);
      assertEquals(promoted, { version: saved, promoted: false });
      assertEquals((yield* files.read(file.id)).content, "two, from another tab");
    }),
  );
});

test("Files -- writeAt creates a file, then saves versions of it", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const first = yield* files.writeAt("essay.md", "one");
      yield* files.writeDraft(first.file.id, first.version.id, "a draft");
      const second = yield* files.writeAt("essay.md", "two");
      assertEquals([first.created, second.created], [true, false]);
      assertEquals(second.file.id, first.file.id);
      assertEquals([first.version.seq, second.version.seq], [1, 2]);
      assertEquals(yield* files.readDraft(first.file.id), Option.none());
    }),
  );
});

test("Files -- concurrent writeAt to a new path lands on a single file", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const results = yield* Effect.all(
        ["a", "b", "c"].map((content) => files.writeAt("essay.md", content)),
        { concurrency: "unbounded" },
      );
      assertEquals(new Set(results.map((result) => result.file.id)).size, 1);
      assertEquals(results.filter((result) => result.created).length, 1);
      assertEquals(
        results.map((result) => result.version.seq).toSorted((a, b) => a - b),
        [1, 2, 3],
      );
    }),
  );
});

test("Files -- promoting clears the draft", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version } = yield* files.createAt("essay.md", "one");
      yield* files.writeDraft(file.id, version.id, "two");
      const promoted = yield* files.promoteDraft(file.id);
      assertEquals(promoted.promoted, true);
      assertEquals(yield* files.readDraft(file.id), Option.none());
    }),
  );
});

test("Files -- a draft edited from an older version is refused", async () => {
  await run(() =>
    Effect.gen(function* () {
      const files = yield* Files;
      const { file, version: first } = yield* files.createAt("essay.md", "one");
      const { version: second } = yield* files.writeAt("essay.md", "two, from another tab");
      assertInstanceOf(
        yield* failure(files.writeDraft(file.id, first.id, "edited from one")),
        DraftStaleError,
      );
      assertEquals(yield* files.readDraft(file.id), Option.none());
      const saved = yield* files.writeDraft(file.id, second.id, "edited from two");
      assertEquals(saved.content, "edited from two");
    }),
  );
});

test("Files -- a draft of a missing file is refused as missing", async () => {
  await run((other) =>
    Effect.gen(function* () {
      const files = yield* Files;
      assertInstanceOf(yield* failure(files.writeDraft("nope", "nope", "x")), FileMissingError);
      const { file, version } = yield* files.createAt("essay.md", "one");
      assertInstanceOf(
        yield* other(failure(files.writeDraft(file.id, version.id, "x"))),
        FileMissingError,
      );
    }),
  );
});
