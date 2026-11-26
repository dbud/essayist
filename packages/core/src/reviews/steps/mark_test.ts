import { assertEquals } from "@std/assert";
import { Effect, Layer, Result, Schema } from "effect";
import { test } from "vitest";

import { Files } from "#/files/service.ts";
import { Marks } from "#/marks/service.ts";
import { testLayer } from "#/persistence/testing/kv.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { applyProposedMarks, type MarkProposal, ProposedMarksSchema } from "./mark.ts";

const PROVENANCE = { runId: "run-1", unitId: "mechanics" };

const env = testLayer(
  Layer.mergeAll(Files.layerNoDeps, Layer.provide(Marks.layerNoDeps, Files.layerNoDeps)),
);

const run = <A>(program: Effect.Effect<A, unknown, Marks | Files | WorkspaceId>): Promise<A> =>
  Effect.runPromise(
    Effect.provide(Effect.provideService(program, WorkspaceId, { wsId: "default" }), env),
  );

test("applyProposedMarks -- places marks on the pinned version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const first = yield* files.write("essay.txt", "hello brave world");
      yield* files.write("essay.txt", "a newer version");
      const proposed: MarkProposal[] = [
        {
          selectedText: "brave",
          comment: "Adjective earns its place.",
          label: "grammar",
        },
      ];

      const attempts = yield* applyProposedMarks(
        proposed,
        ["grammar"],
        { path: "essay.txt", versionId: first.versionId },
        PROVENANCE,
      );

      assertEquals(attempts.length, 1);
      assertEquals(attempts[0].marked, true);
      assertEquals(attempts[0].selectedText, "brave");
      assertEquals(attempts[0].comment, "Adjective earns its place.");
      assertEquals(attempts[0].label, "grammar");
      assertEquals(typeof attempts[0].markId, "string");
      assertEquals(typeof attempts[0].threadId, "string");
      // The mark landed on the pinned version; the newer write has none.
      const marks = yield* files.getMarks("essay.txt", first.versionId);
      assertEquals(marks[0].selectedText, "brave");
      assertEquals(marks[0].meta, PROVENANCE);
      const latest = yield* files.read("essay.txt");
      assertEquals(yield* files.getMarks("essay.txt", latest.versionId), []);
    }),
  );
});

test("applyProposedMarks -- failed spans keep an error", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const first = yield* files.write("essay.txt", "hello world");

      const attempts = yield* applyProposedMarks(
        [{ selectedText: "brave", comment: "ghost span", label: "grammar" }],
        [],
        { path: "essay.txt", versionId: first.versionId },
        PROVENANCE,
      );

      assertEquals(attempts[0].marked, false);
      assertEquals(attempts[0].error, "selected text not found");
    }),
  );
});

test("applyProposedMarks -- rejects labels outside the allowed set", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const first = yield* files.write("essay.txt", "hello world");

      const attempts = yield* applyProposedMarks(
        [{ selectedText: "hello", comment: "wrong label", label: "tone" }],
        ["grammar"],
        { path: "essay.txt", versionId: first.versionId },
        PROVENANCE,
      );

      assertEquals(attempts[0].marked, false);
      assertEquals(attempts[0].error, 'label "tone" is not allowed; use one of: grammar');
    }),
  );
});

test("applyProposedMarks -- every mark carries a label", () => {
  // A mark with no label would apply without the aspect check and render without a badge, so the
  // schema requires one.
  const parsed = Schema.decodeUnknownResult(ProposedMarksSchema)({
    marks: [{ selectedText: "hello", comment: "no label" }],
  });

  assertEquals(Result.isFailure(parsed), true);
});
