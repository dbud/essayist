import { openKv } from "@deno/kv";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { assertObjectMatch } from "@std/assert/object-match";
import { Effect, Layer, Result } from "effect";
import { test } from "vitest";
import type { Mark } from "#/marks/types.ts";
import { kvLayer } from "#/persistence/kv_layer.ts";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
} from "#/persistence/mod.ts";
import { testLayer } from "#/persistence/testing/kv.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import { Files } from "./service.ts";
import { FileMissingError } from "./types.ts";

type E = PersistenceError | ConcurrentModificationError | FileMissingError;

const run = <A>(
  program: Effect.Effect<A, E, Files | WorkspaceId>,
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      Effect.provideService(program, WorkspaceId, { wsId: "default" }),
      testLayer(Files.layerNoDeps),
    ),
  );

const SAMPLE_ESSAY = [
  "The quick brown fox jumps over the lazy dog.",
  "This sentence contains every letter of the alphabet.",
  "It has been used as a typing test since the late 1800s.",
  "The fox was quick, the dog was lazy, and the sentence was perfect.",
].join("\n");

/** ~1.2 MB of text with a known needle ("Ishmael") for chunk tests. */
function largeContent(): string {
  const line =
    "Call me Ishmael. Some years ago, having little money in my purse, I sailed about to see the watery world.";
  const lines = Array.from({ length: 12000 }, (_, i) => `${i + 1}: ${line}`);
  return lines.join("\n");
}

// read

test("Files.read -- full file (latest)", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("essay.txt", SAMPLE_ESSAY);
      const result = yield* files.read("essay.txt");
      assertEquals(result.content, SAMPLE_ESSAY);
      assertEquals(result.lines, 4);
    }),
  );
});

test("Files.read -- missing file fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const outcome = yield* Effect.result(files.read("missing.txt"));
      if (Result.isSuccess(outcome)) {
        throw new Error("a missing file read succeeded");
      }
      assertInstanceOf(outcome.failure, FileMissingError);
    }),
  );
});

test("Files.read -- specific version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      yield* files.write("f.txt", "modified");
      const history = yield* files.getHistory("f.txt");
      assertEquals(history.length, 2);
      const original = yield* files.read("f.txt", history[0].version_id);
      assertEquals(original.content, "original");
      const latest = yield* files.read("f.txt", history[1].version_id);
      assertEquals(latest.content, "modified");
    }),
  );
});

test("Files.read -- unknown version fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      const outcome = yield* Effect.result(
        files.read("f.txt", "no_such_version"),
      );
      if (Result.isSuccess(outcome)) {
        throw new Error("an unknown version read succeeded");
      }
      assertInstanceOf(outcome.failure, FileMissingError);
    }),
  );
});

// list

test("Files.list -- all files", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("a.txt", "line1");
      yield* files.write("b.txt", "line1\nline2");
      yield* files.write("c.md", "x\ny\nz");
      assertEquals(yield* files.list(), [
        { path: "a.txt", lines: 1 },
        { path: "b.txt", lines: 2 },
        { path: "c.md", lines: 3 },
      ]);
    }),
  );
});

test("Files.list -- with prefix", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("notes/a.txt", "x");
      yield* files.write("notes/b.txt", "y");
      yield* files.write("other/c.txt", "z");
      assertEquals(yield* files.list("notes/"), [
        { path: "notes/a.txt", lines: 1 },
        { path: "notes/b.txt", lines: 1 },
      ]);
    }),
  );
});

test("Files.list -- empty", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      assertEquals(yield* files.list(), []);
    }),
  );
});

// history

test("Files.getHistory -- missing file fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const outcome = yield* Effect.result(files.getHistory("missing.txt"));
      if (Result.isSuccess(outcome)) {
        throw new Error("a missing file history succeeded");
      }
      assertInstanceOf(outcome.failure, FileMissingError);
    }),
  );
});

test("Files.getHistory -- includes all versions including latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "v1");
      yield* files.write("f.txt", "v2");
      yield* files.write("f.txt", "v3");
      assertEquals((yield* files.getHistory("f.txt")).length, 3);
    }),
  );
});

test("Files.getHistory -- versions are sorted by timestamp", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "v1");
      yield* files.write("f.txt", "v2");
      yield* files.write("f.txt", "v3");
      yield* files.write("f.txt", "v4");
      const history = yield* files.getHistory("f.txt");
      assertEquals(history.length, 4);
      for (let i = 1; i < history.length; i++) {
        assertEquals(history[i].timestamp >= history[i - 1].timestamp, true);
      }
    }),
  );
});

test("Files.getHistory -- includes line count per version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "one line");
      yield* files.write("f.txt", "line one\nline two\nline three");
      const history = yield* files.getHistory("f.txt");
      assertEquals(history[0].lines, 1);
      assertEquals(history[1].lines, 3);
    }),
  );
});

// drafts and revert

test("Files.writeDraft -- stores and reads the draft without creating a version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "checkpoint");
      yield* files.writeDraft("f.txt", "draft text");

      const draft = yield* files.readDraft("f.txt");
      assertEquals(draft?.content, "draft text");
      assertEquals(typeof draft?.timestamp, "number");
      assertEquals((yield* files.getHistory("f.txt")).length, 1);
      assertEquals((yield* files.read("f.txt")).content, "checkpoint");
    }),
  );
});

test("Files.promoteDraft -- creates a version from the draft and clears it", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "checkpoint");
      yield* files.writeDraft("f.txt", "draft text");

      const result = yield* files.promoteDraft("f.txt");
      assertEquals(result?.created, false);
      assertEquals((yield* files.read("f.txt")).content, "draft text");
      assertEquals(yield* files.readDraft("f.txt"), null);
      assertEquals((yield* files.getHistory("f.txt")).length, 2);
    }),
  );
});

test("Files.promoteDraft -- null when no draft exists", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "checkpoint");
      assertEquals(yield* files.promoteDraft("f.txt"), null);
    }),
  );
});

test("Files.write -- clears a pending draft", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "checkpoint");
      yield* files.writeDraft("f.txt", "draft text");
      yield* files.write("f.txt", "direct write");

      assertEquals(yield* files.readDraft("f.txt"), null);
      assertEquals((yield* files.read("f.txt")).content, "direct write");
    }),
  );
});

test("Files.writeDraft -- shrinks cleanly across chunk boundaries", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "");
      yield* files.writeDraft("f.txt", "x".repeat(60 * 1024 * 2 + 10));
      yield* files.writeDraft("f.txt", "short");

      const draft = yield* files.readDraft("f.txt");
      assertEquals(draft?.content, "short");
    }),
  );
});

test("Files.revert -- restores previous version as new version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      yield* files.write("f.txt", "modified");
      const history = yield* files.getHistory("f.txt");
      const originalVersionId = history[0].version_id;
      assertEquals(yield* files.revert("f.txt", originalVersionId), true);
      assertEquals((yield* files.read("f.txt")).content, "original");
    }),
  );
});

test("Files.revert -- creates a new version when reverting", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "v1");
      yield* files.write("f.txt", "v2");
      const history = yield* files.getHistory("f.txt");
      yield* files.revert("f.txt", history[0].version_id);
      assertEquals((yield* files.getHistory("f.txt")).length, 3);
    }),
  );
});

test("Files.revert -- returns false for invalid version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "content");
      assertEquals(yield* files.revert("f.txt", "nonexistent"), false);
    }),
  );
});

// diff

test("Files.diff -- between versions", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "line1\nline2\nline3");
      yield* files.write("f.txt", "line1\nmodified\nline3");
      const history = yield* files.getHistory("f.txt");
      const { diff } = yield* files.diff(
        "f.txt",
        history[0].version_id,
        history[1].version_id,
      );
      assertEquals(diff.includes("-line2"), true);
      assertEquals(diff.includes("+modified"), true);
    }),
  );
});

test("Files.diff -- identical content produces empty diff", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "same");
      yield* files.write("f.txt", "different");
      const history = yield* files.getHistory("f.txt");
      if (history.length >= 2) {
        yield* files.write("f.txt", "same");
        const newHistory = yield* files.getHistory("f.txt");
        const { diff } = yield* files.diff(
          "f.txt",
          newHistory[0].version_id,
          newHistory[2].version_id,
        );
        assertEquals(diff, "");
      }
    }),
  );
});

test("Files -- large document roundtrips", async () => {
  const content = largeContent();
  assert(content.length > 60 * 1024, "fixture should exceed one chunk");
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("big.md", content);
      const result = yield* files.read("big.md");
      assertEquals(result.content, content);
      assertEquals(result.lines, content.split("\n").length);
    }),
  );
});

// marks storage (marks synthesized with saveMark; placement lands with the
// Marks service)

function createMark(
  overrides: Partial<Mark> & { selected_text: string },
): Mark {
  const {
    id = `mark_${Math.random().toString(36).slice(2)}`,
    thread_id = `thread_${Math.random().toString(36).slice(2)}`,
    path = "f.txt",
    version_id = "v1",
    selected_text,
    before_context = "",
    after_context = "",
    comment = "test comment",
    label,
    created_at = 1000,
    offset = 0,
    length = selected_text.length,
    status = "resolved",
    meta,
  } = overrides;
  return {
    id,
    thread_id,
    path,
    version_id,
    selected_text,
    before_context,
    after_context,
    comment,
    label,
    created_at,
    offset,
    length,
    status,
    meta,
  };
}

test("Files.getMarks -- returns empty when no marks", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      assertEquals(yield* files.getMarks("f.txt", v1), []);
    }),
  );
});

test("Files.getMarks -- returns all marks for a version in save order", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "hello" }),
      );
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );

      const marks = yield* files.getMarks("f.txt", v1);
      assertEquals(marks.length, 2);
      assertEquals(marks[0].selected_text, "hello");
      assertEquals(marks[1].selected_text, "world");
    }),
  );
});

test("Files.deleteMark -- removes a mark", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      const mark = createMark({ version_id: v1, selected_text: "hello" });
      yield* files.saveMark(mark);

      assertEquals(yield* files.deleteMark("f.txt", v1, mark.id), true);
      assertEquals(yield* files.getMarks("f.txt", v1), []);
    }),
  );
});

test("Files.deleteMark -- returns false for nonexistent mark", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      assertEquals(yield* files.deleteMark("f.txt", v1, "no-such-mark"), false);
    }),
  );
});

test("Files -- marks are isolated per workspace scope", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const inA = Effect.provideService(
        Effect.gen(function* () {
          const v = (yield* files.write("f.txt", "the quick brown fox"))
            .version_id;
          yield* files.saveMark(
            createMark({
              version_id: v,
              selected_text: "quick brown",
              offset: 4,
              length: 11,
            }),
          );
          return v;
        }),
        WorkspaceId,
        { wsId: "ws-a" },
      );
      yield* inA;
      yield* Effect.provideService(
        files.write("f.txt", "the quick brown fox"),
        WorkspaceId,
        { wsId: "ws-b" },
      );

      const a = yield* Effect.provideService(
        Effect.gen(function* () {
          const versions = yield* files.getHistory("f.txt");
          return yield* files.getMarks(
            "f.txt",
            versions[versions.length - 1].version_id,
          );
        }),
        WorkspaceId,
        { wsId: "ws-a" },
      );
      const b = yield* Effect.provideService(
        Effect.gen(function* () {
          const versions = yield* files.getHistory("f.txt");
          return yield* files.getMarks(
            "f.txt",
            versions[versions.length - 1].version_id,
          );
        }),
        WorkspaceId,
        { wsId: "ws-b" },
      );
      assertEquals(a.length, 1);
      assertEquals(b.length, 0);
    }),
  );
});

test("Files.write -- migrates marks to the new version when text unchanged", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "hello", offset: 0 }),
      );
      const v2 = (yield* files.write("f.txt", "hello beautiful world"))
        .version_id;

      const marks = yield* files.getMarks("f.txt", v2);
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selected_text: "hello",
        status: "resolved",
        offset: 0,
      });
    }),
  );
});

test("Files.write -- migrates marks with shifted offset", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );
      const v2 = (yield* files.write("f.txt", "hello beautiful world"))
        .version_id;

      const marks = yield* files.getMarks("f.txt", v2);
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], { offset: 16 });
    }),
  );
});

test("Files.write -- marks become stale when text is deleted", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );
      const v2 = (yield* files.write("f.txt", "hello")).version_id;

      const marks = yield* files.getMarks("f.txt", v2);
      assertEquals(marks.length, 1);
      assertEquals(marks[0].status, "stale");
    }),
  );
});

test("Files.write -- stale marks survive subsequent writes", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );
      const v2 = (yield* files.write("f.txt", "hello")).version_id;
      assertEquals((yield* files.getMarks("f.txt", v2))[0].status, "stale");

      const v3 = (yield* files.write("f.txt", "hello again")).version_id;
      const marks3 = yield* files.getMarks("f.txt", v3);
      assertEquals(marks3.length, 1);
      assertEquals(marks3[0].status, "stale");
    }),
  );
});

test("Files.revert -- migrates marks through write", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      // Contexts like the mark tool captures them; the resolver re-anchors
      // through matched contexts when the selected text moved or returned.
      yield* files.saveMark(
        createMark({
          version_id: v1,
          selected_text: "hello",
          offset: 0,
          after_context: " world",
        }),
      );
      yield* files.write("f.txt", "goodbye world");
      yield* files.revert("f.txt", v1);

      const file = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", file.version_id);
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selected_text: "hello",
        status: "resolved",
      });
    }),
  );
});

test("Files.migrateMarks -- re-anchors marks added to an old version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "hello", offset: 0 }),
      );
      yield* files.write("f.txt", "hello beautiful world");

      // Added to v1 after the write, so the write migration missed it.
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.version_id);
      assertEquals(result, { migrated: 1, stale: 0 });
      assertEquals(marks.length, 2);
      assertObjectMatch(marks[1], {
        selected_text: "world",
        offset: 16,
        status: "resolved",
      });
    }),
  );
});

test("Files.migrateMarks -- skips marks already on the latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "hello", offset: 0 }),
      );
      yield* files.write("f.txt", "hello there");

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.version_id);
      assertEquals(result, { migrated: 0, stale: 0 });
      assertEquals(marks.length, 1);
    }),
  );
});

test("Files.migrateMarks -- no-op when source version is latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "hello", offset: 0 }),
      );

      const result = yield* files.migrateMarks("f.txt", v1);
      assertEquals(result, { migrated: 0, stale: 0 });
      assertEquals((yield* files.getMarks("f.txt", v1)).length, 1);
    }),
  );
});

test("Files.migrateMarks -- resolves shifted text", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "alpha beta")).version_id;
      yield* files.write("f.txt", "alpha gamma beta");
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "beta", offset: 6 }),
      );

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.version_id);
      assertEquals(result, { migrated: 1, stale: 0 });
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selected_text: "beta",
        offset: 12,
        status: "resolved",
      });
    }),
  );
});

test("Files.migrateMarks -- marks go stale when text is gone", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).version_id;
      yield* files.write("f.txt", "completely different");
      yield* files.saveMark(
        createMark({ version_id: v1, selected_text: "world", offset: 6 }),
      );

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.version_id);
      assertEquals(result, { migrated: 1, stale: 1 });
      assertEquals(marks[0].status, "stale");
    }),
  );
});

test("Files.migrateMarks -- returns zeros for unknown version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "hello world");

      const result = yield* files.migrateMarks("f.txt", "no-such-version");
      assertEquals(result, { migrated: 0, stale: 0 });
    }),
  );
});

// storage layout: chunk 0 inlines in the manifest; the rest get chunk keys

test("Files -- small file inlines content in the latest key (no chunk keys)", async () => {
  const kv = await openKv();
  try {
    const env = Layer.merge(
      kvLayer(kv),
      Layer.provide(Files.layerNoDeps, kvLayer(kv)),
    );
    const { entries } = await Effect.runPromise(
      Effect.provide(
        Effect.provideService(
          Effect.gen(function* () {
            const files = yield* Files;
            yield* files.write("small.txt", "hello world");
            const persistence = yield* Persistence;
            return yield* persistence.list(["ws", "ws", "file:content"]);
          }),
          WorkspaceId,
          { wsId: "ws" },
        ),
        env,
      ),
    );
    const manifestKeys = entries.filter(
      (e) => e.key[e.key.length - 1] === "file:manifest",
    );
    const chunkKeys = entries.filter(
      (e) => e.key[e.key.length - 2] === "file:chunk",
    );
    assertEquals(manifestKeys.length, 1);
    assertEquals(chunkKeys.length, 0, "small file must not write chunk keys");
  } finally {
    await kv.close();
  }
});

test("Files -- large write inlines first chunk, rest as chunk keys", async () => {
  const content = largeContent();
  const kv = await openKv();
  try {
    const env = Layer.merge(
      kvLayer(kv),
      Layer.provide(Files.layerNoDeps, kvLayer(kv)),
    );
    const { entries } = await Effect.runPromise(
      Effect.provide(
        Effect.provideService(
          Effect.gen(function* () {
            const files = yield* Files;
            yield* files.write("big.md", content);
            const persistence = yield* Persistence;
            return yield* persistence.list(["ws", "ws", "file:content"]);
          }),
          WorkspaceId,
          { wsId: "ws" },
        ),
        env,
      ),
    );
    const manifestKeys = entries.filter(
      (e) => e.key[e.key.length - 1] === "file:manifest",
    );
    const chunkKeys = entries.filter(
      (e) => e.key[e.key.length - 2] === "file:chunk",
    );
    assertEquals(manifestKeys.length, 1);
    // Chunk 0 is inlined in the manifest; chunk keys start at index 1.
    const indices = chunkKeys
      .map((e) => Number(e.key[e.key.length - 1]))
      .sort((a, b) => a - b);
    assertEquals(indices[0], 1);
    assert(chunkKeys.length > 1, "should produce multiple chunk keys");
    for (const e of chunkKeys) {
      const v = e.value as Uint8Array;
      assert(v.length <= 60 * 1024, "chunk must respect CHUNK_SIZE");
    }
  } finally {
    await kv.close();
  }
});
