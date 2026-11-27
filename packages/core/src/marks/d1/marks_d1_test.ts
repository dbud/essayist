import { assertEquals, assertInstanceOf, assertObjectMatch } from "@std/assert";
import { Effect, Layer, Option } from "effect";
import { test } from "vitest";

import { layerFilesD1 } from "#/files/d1/files_d1.ts";
import { Files } from "#/files/d1/service.ts";
import { FileMissingError } from "#/files/d1/types.ts";
import { testLayerD1 } from "#/persistence/testing/d1.ts";
import { layerReviewRunsD1 } from "#/reviews/runs_d1.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import { Workspaces } from "#/workspace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

import { layerMarksD1 } from "./marks_d1.ts";
import { type MarkInput, Marks } from "./service.ts";
import { MarkTextNotFoundError } from "./types.ts";

const layer = testLayerD1((client) =>
  Layer.mergeAll(
    layerFilesD1(client),
    layerWorkspacesD1(client),
    layerReviewRunsD1(client),
    Layer.provide(layerMarksD1(client), layerFilesD1(client)),
  ),
);

type Services = Files | Marks | ReviewRuns | WorkspaceId;

/** Run a test program in a fresh workspace; `other` runs a program in a second one. */
const run = <A, E>(
  program: (
    other: <B, F>(
      effect: Effect.Effect<B, F, Services>,
    ) => Effect.Effect<B, F, Exclude<Services, WorkspaceId>>,
  ) => Effect.Effect<A, E, Services>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const workspaces = yield* Workspaces;
      const owner = yield* workspaces.createUser({ email: "owner@example.com" });
      const workspace = yield* workspaces.createWorkspace("Essays", owner.id);
      const second = yield* workspaces.createWorkspace("Other", owner.id);
      const other = <B, F>(effect: Effect.Effect<B, F, Services>) =>
        Effect.provideService(effect, WorkspaceId, { wsId: second.id });
      return yield* Effect.provideService(program(other), WorkspaceId, { wsId: workspace.id });
    }).pipe(Effect.provide(layer)),
  );

type Pin = Pick<MarkInput, "fileId" | "versionId" | "runId">;

/** A file with a review run on its first version; every mark needs a run. */
const pinOn = (content: string) =>
  Effect.gen(function* () {
    const { file, version } = yield* Files.use((files) => files.createAt("essay.md", content));
    const reviewRun = yield* ReviewRuns.use((runs) =>
      runs.createRun({ path: "essay.md", versionId: version.id, reviewPassId: "pass" }),
    );
    return { fileId: file.id, versionId: version.id, runId: reviewRun.id };
  });

/** Place a mark on the pin and return the marks of its run. */
const markAndRead = (pin: Pin, selectedText: string, options: Partial<MarkInput> = {}) =>
  Effect.gen(function* () {
    const marks = yield* Marks;
    const result = yield* marks.mark({ ...pin, selectedText, comment: "a note", ...options });
    return { result, stored: yield* marks.ofRun(pin.runId) };
  });

test("Marks -- places a mark on the text", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("The quick brown fox jumps over the lazy dog.");
      const { result, stored } = yield* markAndRead(pin, "quick brown");
      assertEquals(
        stored.map((mark) => mark.id),
        [result.id],
      );
      assertObjectMatch(stored[0], {
        runId: pin.runId,
        selectedText: "quick brown",
        offset: 4,
        length: 11,
      });
    }),
  );
});

test("Marks -- text that is not found fails, and places nothing", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      const error = yield* Effect.flip(markAndRead(pin, "nonexistent"));
      assertInstanceOf(error, MarkTextNotFoundError);
      assertEquals(yield* Marks.use((marks) => marks.ofRun(pin.runId)), []);
    }),
  );
});

test("Marks -- a missing version fails as missing", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      const error = yield* Effect.flip(markAndRead(pin, "hello", { versionId: "nope" }));
      assertInstanceOf(error, FileMissingError);
    }),
  );
});

test("Marks -- lineHint picks the occurrence near that line", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("The cat sat on\nthe cat mat.");
      const { stored } = yield* markAndRead(pin, "cat", { lineHint: 2 });
      assertEquals(
        stored.map((mark) => mark.offset),
        [19],
      );
    }),
  );
});

test("Marks -- lineHint beyond the last line clamps to the end", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello");
      const { stored } = yield* markAndRead(pin, "hello", { lineHint: 99 });
      assertEquals(
        stored.map((mark) => mark.offset),
        [0],
      );
    }),
  );
});

test("Marks -- captures context snapped to word boundaries", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("One. Two. MARK Three. Four.");
      const { stored } = yield* markAndRead(pin, "MARK", { contextSpan: 5 });
      assertObjectMatch(stored[0], { beforeContext: "Two. ", afterContext: " Three" });
    }),
  );
});

test("Marks -- context stops at the start and end of the text", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hi world");
      const { stored } = yield* markAndRead(pin, "hi");
      assertObjectMatch(stored[0], { beforeContext: "", afterContext: " world" });
    }),
  );
});

test("Marks -- marks the version given, not the latest", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("old draft text");
      yield* Files.use((files) => files.writeAt("essay.md", "new draft text"));
      // "old draft" is only in the pinned version
      const { stored } = yield* markAndRead(pin, "old draft", { contextSpan: 5 });
      assertObjectMatch(stored[0], { beforeContext: "", afterContext: " text" });
    }),
  );
});

test("Marks -- stores the category, none when not given", async () => {
  await run(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      yield* markAndRead(pin, "hello", { categoryId: "grammar" });
      const { stored } = yield* markAndRead(pin, "world");
      assertEquals(
        stored.map((mark) => mark.categoryId),
        [Option.some("grammar"), Option.none()],
      );
    }),
  );
});

test("Marks -- the marks of a run in another workspace read as none", async () => {
  await run((other) =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      yield* markAndRead(pin, "hello");
      assertEquals((yield* other(Marks.use((marks) => marks.ofRun(pin.runId)))).length, 0);
      assertEquals((yield* Marks.use((marks) => marks.ofRun(pin.runId))).length, 1);
    }),
  );
});
