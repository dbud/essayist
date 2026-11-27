import { assertEquals, assertInstanceOf, assertObjectMatch } from "@std/assert";
import { Effect, Option, Result, Schema } from "effect";
import { test } from "vitest";

import { Files } from "#/files/d1/service.ts";
import { FileMissingError } from "#/files/d1/types.ts";
import { Marks } from "#/marks/d1/service.ts";
import { reviewedFile, runInWorkspace } from "#/reviews/testing.ts";

import { applyProposedMarks, type MarkContext, ProposedMarksSchema } from "./mark.ts";

const GRAMMAR = { id: "cat-grammar", label: "grammar" };

/** The mark context of a file under review. */
const contextOn = (content: string, categories: MarkContext["categories"] = [GRAMMAR]) =>
  reviewedFile(content).pipe(
    Effect.map(({ file, version, run }): MarkContext => ({
      fileId: file.id,
      versionId: version.id,
      runId: run.id,
      categories,
    })),
  );

test("applyProposedMarks -- places marks on the reviewed version, in their category", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const context = yield* contextOn("hello brave world");
      yield* Files.use((files) => files.writeAt("essay.md", "a newer version"));

      const attempts = yield* applyProposedMarks(
        [{ selectedText: "brave", comment: "Adjective earns its place.", label: "grammar" }],
        context,
      );

      const [mark] = yield* Marks.use((marks) => marks.ofRun(context.runId));
      assertEquals(attempts, [
        {
          selectedText: "brave",
          comment: "Adjective earns its place.",
          label: "grammar",
          marked: true,
          markId: mark.id,
        },
      ]);
      assertEquals([mark.offset, mark.categoryId], [6, Option.some("cat-grammar")]);
    }),
  );
});

test("applyProposedMarks -- text that is not found keeps its reason", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const context = yield* contextOn("hello world");
      const attempts = yield* applyProposedMarks(
        [{ selectedText: "brave", comment: "ghost span", label: "grammar" }],
        context,
      );
      assertObjectMatch(attempts[0], { marked: false, error: "selected text not found" });
    }),
  );
});

test("applyProposedMarks -- rejects labels outside the categories of the pass", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const context = yield* contextOn("hello world");
      const attempts = yield* applyProposedMarks(
        [{ selectedText: "hello", comment: "wrong label", label: "tone" }],
        context,
      );
      assertObjectMatch(attempts[0], {
        marked: false,
        error: 'label "tone" is not allowed; use one of: grammar',
      });
      assertEquals(yield* Marks.use((marks) => marks.ofRun(context.runId)), []);
    }),
  );
});

test("applyProposedMarks -- a pass without categories takes any label, uncategorised", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const context = yield* contextOn("hello world", []);
      yield* applyProposedMarks(
        [{ selectedText: "hello", comment: "a note", label: "tone" }],
        context,
      );
      const [mark] = yield* Marks.use((marks) => marks.ofRun(context.runId));
      assertEquals(mark.categoryId, Option.none());
    }),
  );
});

test("applyProposedMarks -- a missing version fails the step", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const context = yield* contextOn("hello world");
      const error = yield* Effect.flip(
        applyProposedMarks([{ selectedText: "hello", comment: "a note", label: "grammar" }], {
          ...context,
          versionId: "nope",
        }),
      );
      assertInstanceOf(error, FileMissingError);
    }),
  );
});

test("applyProposedMarks -- every mark carries a label", () => {
  // A mark with no label would apply without the category check, so the schema requires one.
  const parsed = Schema.decodeUnknownResult(ProposedMarksSchema)({
    marks: [{ selectedText: "hello", comment: "no label" }],
  });

  assertEquals(Result.isFailure(parsed), true);
});
