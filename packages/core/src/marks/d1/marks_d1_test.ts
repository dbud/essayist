import { assertEquals, assertInstanceOf, assertObjectMatch } from "@std/assert";
import { Effect, Option } from "effect";
import { test } from "vitest";

import { Files } from "#/files/d1/service.ts";
import { FileMissingError } from "#/files/d1/types.ts";
import { reviewedFile, runInWorkspace } from "#/reviews/testing.ts";

import { type MarkInput, Marks } from "./service.ts";
import { MarkTextNotFoundError } from "./types.ts";

type Pin = Pick<MarkInput, "fileId" | "versionId" | "runId">;

/** A file with a review run on its first version; every mark needs a run. */
const pinOn = (content: string) =>
  reviewedFile(content).pipe(
    Effect.map(({ file, version, run }): Pin => ({
      fileId: file.id,
      versionId: version.id,
      runId: run.id,
    })),
  );

/** Place a mark on the pin and return the marks of its run. */
const markAndRead = (pin: Pin, selectedText: string, options: Partial<MarkInput> = {}) =>
  Effect.gen(function* () {
    const marks = yield* Marks;
    const result = yield* marks.mark({ ...pin, selectedText, comment: "a note", ...options });
    return { result, stored: yield* marks.ofRun(pin.runId) };
  });

test("Marks -- places a mark on the text", async () => {
  await runInWorkspace(() =>
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
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      const error = yield* Effect.flip(markAndRead(pin, "nonexistent"));
      assertInstanceOf(error, MarkTextNotFoundError);
      assertEquals(yield* Marks.use((marks) => marks.ofRun(pin.runId)), []);
    }),
  );
});

test("Marks -- a missing version fails as missing", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      const error = yield* Effect.flip(markAndRead(pin, "hello", { versionId: "nope" }));
      assertInstanceOf(error, FileMissingError);
    }),
  );
});

test("Marks -- lineHint picks the occurrence near that line", async () => {
  await runInWorkspace(() =>
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
  await runInWorkspace(() =>
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
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("One. Two. MARK Three. Four.");
      const { stored } = yield* markAndRead(pin, "MARK", { contextSpan: 5 });
      assertObjectMatch(stored[0], { beforeContext: "Two. ", afterContext: " Three" });
    }),
  );
});

test("Marks -- context stops at the start and end of the text", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hi world");
      const { stored } = yield* markAndRead(pin, "hi");
      assertObjectMatch(stored[0], { beforeContext: "", afterContext: " world" });
    }),
  );
});

test("Marks -- marks the version given, not the latest", async () => {
  await runInWorkspace(() =>
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
  await runInWorkspace(() =>
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
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const pin = yield* pinOn("hello world");
      yield* markAndRead(pin, "hello");
      assertEquals((yield* other(Marks.use((marks) => marks.ofRun(pin.runId)))).length, 0);
      assertEquals((yield* Marks.use((marks) => marks.ofRun(pin.runId))).length, 1);
    }),
  );
});
