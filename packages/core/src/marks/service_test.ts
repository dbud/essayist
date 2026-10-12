import { assertEquals, assertObjectMatch } from "@std/assert";
import { Effect, Layer } from "effect";
import { Files } from "@/files/service.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { testLayer } from "@/persistence/testing/kv.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { Marks } from "./service.ts";

type E = PersistenceError | ConcurrentModificationError;

const run = <A>(
  program: Effect.Effect<A, E, Files | Marks | WorkspaceId>,
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      Effect.provideService(program, WorkspaceId, { wsId: "default" }),
      testLayer(
        Layer.merge(
          Layer.provide(Marks.layerNoDeps, Files.layerNoDeps),
          Files.layerNoDeps,
        ),
      ),
    ),
  );

/** Write a file; its first version id seeds the version-scoped tests. */
function createFile(path: string, content: string) {
  return Effect.gen(function* () {
    const files = yield* Files;
    const versionId = (yield* files.write(path, content)).version_id;
    return { files, versionId };
  });
}

// mark

Deno.test("Marks.mark -- places a mark on selected text", async () => {
  await run(
    Effect.gen(function* () {
      yield* createFile(
        "essay.txt",
        "The quick brown fox jumps over the lazy dog.",
      );
      const marks = yield* Marks;

      const result = yield* marks.mark(
        "essay.txt",
        "quick brown",
        "nice phrase",
      );

      assertEquals(result.marked, true);
      assertEquals(typeof result.mark_id, "string");
      assertEquals(typeof result.thread_id, "string");
    }),
  );
});

Deno.test("Marks.mark -- returns marked false when text not found", async () => {
  await run(
    Effect.gen(function* () {
      yield* createFile("f.txt", "hello world");
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "nonexistent", "comment");

      assertEquals(result.marked, false);
      assertEquals(result.mark_id, "");
    }),
  );
});

Deno.test("Marks.mark -- returns marked false for empty file", async () => {
  await run(
    Effect.gen(function* () {
      yield* createFile("f.txt", "");
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "anything", "comment");

      assertEquals(result.marked, false);
    }),
  );
});

Deno.test("Marks.mark -- returns marked false for missing file", async () => {
  await run(
    Effect.gen(function* () {
      const marks = yield* Marks;

      const result = yield* marks.mark("missing.txt", "hello", "comment");

      assertEquals(result.marked, false);
    }),
  );
});

Deno.test("Marks.mark -- uses lineHint to disambiguate duplicates", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile(
        "f.txt",
        "The cat sat on\nthe cat mat.",
      );
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "cat", "second cat", {
        lineHint: 2,
      });

      assertEquals(result.marked, true);
      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertEquals(stored[0].offset, 19);
    }),
  );
});

Deno.test("Marks.mark -- lineHint 1 targets first line", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile(
        "f.txt",
        "alpha beta\ngamma delta",
      );
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "alpha", "on line 1", { lineHint: 1 });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertEquals(stored[0].offset, 0);
    }),
  );
});

Deno.test("Marks.mark -- lineHint beyond last line clamps to end", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile("f.txt", "hello");
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "hello", "only line", { lineHint: 99 });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertEquals(stored[0].offset, 0);
    }),
  );
});

Deno.test("Marks.mark -- lineHint with no newlines", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile(
        "f.txt",
        "single line content",
      );
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "line", "no newlines", { lineHint: 1 });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertEquals(stored[0].offset, 7);
    }),
  );
});

Deno.test("Marks.mark -- accepts explicit threadId", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile("f.txt", "hello world");
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "hello", "greeting", {
        threadId: "thread-abc",
      });

      assertEquals(result.thread_id, "thread-abc");
      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored[0].thread_id, "thread-abc");
    }),
  );
});

Deno.test("Marks.mark -- captures context around selection", async () => {
  // With no intervening word boundaries (a single long token run on each
  // side), the whole long word is included in full -- there is no cap, so a
  // pathological long token yields a large context.
  await run(
    Effect.gen(function* () {
      const content = `${"A".repeat(100)}TARGET${"B".repeat(100)}`;
      const { files, versionId } = yield* createFile("f.txt", content);
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "TARGET", "middle");

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertObjectMatch(stored[0], {
        before_context: "A".repeat(100),
        after_context: "B".repeat(100),
      });
    }),
  );
});

Deno.test("Marks.mark -- context snapped to word boundaries", async () => {
  // Small contextSpan so snapping is observable: before_context starts at a
  // word start, after_context ends at a word end, instead of an arbitrary
  // char window. Trailing punctuation after a word is not included.
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile(
        "f.txt",
        "One. Two. MARK Three. Four.",
      );
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "MARK", "snap", { contextSpan: 5 });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertObjectMatch(stored[0], {
        before_context: "Two. ",
        after_context: " Three",
      });
    }),
  );
});

Deno.test("Marks.mark -- context truncated at file boundaries", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile("f.txt", "hi world");
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "hi", "at start");

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertObjectMatch(stored[0], {
        before_context: "",
        after_context: " world",
      });
    }),
  );
});

Deno.test("Marks.mark -- uses custom contextSpan", async () => {
  // A larger span captures more words, confirming the option controls the
  // window (distinct from the contextSpan: 5 case above).
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile(
        "f.txt",
        "One. Two. MARK Three. Four.",
      );
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "MARK", "custom span", { contextSpan: 8 });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored.length, 1);
      assertObjectMatch(stored[0], {
        before_context: "One. Two. ",
        after_context: " Three. Four",
      });
    }),
  );
});

Deno.test("Marks.mark -- stores label when provided", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile("f.txt", "hello world");
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "hello", "greeting", { label: "important" });

      const stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored[0].label, "important");
    }),
  );
});

Deno.test("Marks.mark -- stores provenance when provided", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId } = yield* createFile("f.txt", "hello world");
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "hello", "greeting", {
        provenance: { runId: "run-1", unitId: "mechanics" },
      });

      let stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored[0].meta, { runId: "run-1", unitId: "mechanics" });

      yield* marks.mark("f.txt", "world", "no provenance");
      stored = yield* files.getMarks("f.txt", versionId);
      assertEquals(stored[1].meta, undefined);
    }),
  );
});

// mark with versionId

Deno.test("Marks.mark -- versionId marks the given version, not latest", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId: v1 } = yield* createFile(
        "f.txt",
        "hello world",
      );
      yield* files.write("f.txt", "goodbye world");
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "hello", "greeting", {
        versionId: v1,
      });

      assertEquals(result.marked, true);
      const v1Marks = yield* files.getMarks("f.txt", v1);
      assertEquals(v1Marks.length, 1);
      assertEquals(v1Marks[0].version_id, v1);
      assertEquals(v1Marks[0].selected_text, "hello");
      assertEquals(v1Marks[0].comment, "greeting");
      const latest = yield* files.read("f.txt");
      assertEquals(yield* files.getMarks("f.txt", latest.version_id), []);
    }),
  );
});

Deno.test("Marks.mark -- versionId resolves text against that version's content", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId: v1 } = yield* createFile(
        "f.txt",
        "old draft text",
      );
      yield* files.write("f.txt", "new draft text");
      const marks = yield* Marks;

      // "old draft" only exists in v1; "new draft" only in latest.
      const oldResult = yield* marks.mark("f.txt", "old draft", "from v1", {
        versionId: v1,
      });
      assertEquals(oldResult.marked, true);

      const latestResult = yield* marks.mark(
        "f.txt",
        "old draft",
        "from latest",
      );
      assertEquals(latestResult.marked, false);
    }),
  );
});

Deno.test("Marks.mark -- versionId uses lineHint against that version", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId: v1 } = yield* createFile(
        "f.txt",
        "first version line\nsecond version line",
      );
      yield* files.write("f.txt", "completely different");
      const marks = yield* Marks;

      const result = yield* marks.mark(
        "f.txt",
        "version line",
        "line 2 of v1",
        {
          versionId: v1,
          lineHint: 2,
        },
      );

      assertEquals(result.marked, true);
      const stored = yield* files.getMarks("f.txt", v1);
      assertEquals(stored.length, 1);
      assertEquals(stored[0].offset, 26);
    }),
  );
});

Deno.test("Marks.mark -- versionId captures context from that version", async () => {
  await run(
    Effect.gen(function* () {
      const { files, versionId: v1 } = yield* createFile(
        "f.txt",
        "alpha TARGET omega",
      );
      yield* files.write("f.txt", "TARGET");
      const marks = yield* Marks;

      yield* marks.mark("f.txt", "TARGET", "pinned context", {
        versionId: v1,
        contextSpan: 5,
      });

      const stored = yield* files.getMarks("f.txt", v1);
      assertObjectMatch(stored[0], {
        before_context: "alpha ",
        after_context: " omega",
      });
    }),
  );
});

Deno.test("Marks.mark -- returns marked false for unknown versionId", async () => {
  await run(
    Effect.gen(function* () {
      yield* createFile("f.txt", "hello world");
      const marks = yield* Marks;

      const result = yield* marks.mark("f.txt", "hello", "greeting", {
        versionId: "no-such-version",
      });

      assertEquals(result.marked, false);
      assertEquals(result.mark_id, "");
    }),
  );
});
