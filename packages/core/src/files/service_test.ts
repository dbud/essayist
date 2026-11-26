import { openKv } from "@deno/kv";
import { assert, assertEquals, assertInstanceOf, assertNotEquals } from "@std/assert";
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

const run = <A>(program: Effect.Effect<A, E, Files | WorkspaceId>): Promise<A> =>
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
      const history = yield* files.getVersions("f.txt");
      assertEquals(history.length, 2);
      const original = yield* files.read("f.txt", history[0].versionId);
      assertEquals(original.content, "original");
      const latest = yield* files.read("f.txt", history[1].versionId);
      assertEquals(latest.content, "modified");
    }),
  );
});

test("Files.read -- unknown version fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      const outcome = yield* Effect.result(files.read("f.txt", "no_such_version"));
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
      const a = yield* files.write("a.txt", "line1");
      const b = yield* files.write("b.txt", "line1\nline2");
      const c = yield* files.write("c.md", "x\ny\nz");
      assertEquals(yield* files.list(), [
        { path: "a.txt", lines: 1, latestVersionId: a.versionId },
        { path: "b.txt", lines: 2, latestVersionId: b.versionId },
        { path: "c.md", lines: 3, latestVersionId: c.versionId },
      ]);
    }),
  );
});

test("Files.list -- with prefix", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const a = yield* files.write("notes/a.txt", "x");
      const b = yield* files.write("notes/b.txt", "y");
      yield* files.write("other/c.txt", "z");
      assertEquals(yield* files.list("notes/"), [
        { path: "notes/a.txt", lines: 1, latestVersionId: a.versionId },
        { path: "notes/b.txt", lines: 1, latestVersionId: b.versionId },
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

test("Files.getVersions -- missing file fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const outcome = yield* Effect.result(files.getVersions("missing.txt"));
      if (Result.isSuccess(outcome)) {
        throw new Error("a missing file history succeeded");
      }
      assertInstanceOf(outcome.failure, FileMissingError);
    }),
  );
});

test("Files.getVersions -- includes all versions including latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "v1");
      yield* files.write("f.txt", "v2");
      yield* files.write("f.txt", "v3");
      assertEquals((yield* files.getVersions("f.txt")).length, 3);
    }),
  );
});

test("Files.getVersions -- versions are sorted by timestamp", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "v1");
      yield* files.write("f.txt", "v2");
      yield* files.write("f.txt", "v3");
      yield* files.write("f.txt", "v4");
      const history = yield* files.getVersions("f.txt");
      assertEquals(history.length, 4);
      for (let i = 1; i < history.length; i++) {
        assertEquals(history[i].timestamp >= history[i - 1].timestamp, true);
      }
    }),
  );
});

test("Files.getVersions -- includes line count per version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "one line");
      yield* files.write("f.txt", "line one\nline two\nline three");
      const history = yield* files.getVersions("f.txt");
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
      assertEquals((yield* files.getVersions("f.txt")).length, 1);
      assertEquals((yield* files.read("f.txt")).content, "checkpoint");
    }),
  );
});

test("Files.readDraft -- null when the version is not the latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      yield* files.write("f.txt", "modified");
      yield* files.writeDraft("f.txt", "draft text");
      const history = yield* files.getVersions("f.txt");
      const head = yield* files.readDraft("f.txt", history[1].versionId);
      assertEquals(head?.content, "draft text");
      assertEquals(yield* files.readDraft("f.txt", history[0].versionId), null);
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
      assertEquals(result.promoted, true);
      assertEquals((yield* files.read("f.txt")).content, "draft text");
      assertEquals(yield* files.readDraft("f.txt"), null);
      const versions = yield* files.getVersions("f.txt");
      assertEquals(versions.length, 2);
      assertEquals(result.version.versionId, versions.at(-1)?.versionId);
    }),
  );
});

test("Files.promoteDraft -- the latest version when no draft exists", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const checkpoint = yield* files.write("f.txt", "checkpoint");

      const result = yield* files.promoteDraft("f.txt");
      assertEquals(result.promoted, false);
      assertEquals(result.version.versionId, checkpoint.versionId);
    }),
  );
});

test("Files.promoteDraft -- missing file fails", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const outcome = yield* Effect.result(files.promoteDraft("missing.txt"));
      if (Result.isSuccess(outcome)) {
        throw new Error("a missing file promote succeeded");
      }
      assertInstanceOf(outcome.failure, FileMissingError);
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
      const history = yield* files.getVersions("f.txt");
      const originalVersionId = history[0].versionId;
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
      const history = yield* files.getVersions("f.txt");
      yield* files.revert("f.txt", history[0].versionId);
      assertEquals((yield* files.getVersions("f.txt")).length, 3);
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
      const history = yield* files.getVersions("f.txt");
      const { diff } = yield* files.diff("f.txt", history[0].versionId, history[1].versionId);
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
      const history = yield* files.getVersions("f.txt");
      if (history.length >= 2) {
        yield* files.write("f.txt", "same");
        const newHistory = yield* files.getVersions("f.txt");
        const { diff } = yield* files.diff(
          "f.txt",
          newHistory[0].versionId,
          newHistory[2].versionId,
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

// marks storage (marks synthesized with saveMark; placement lands with the Marks service)

function createMark(overrides: Partial<Mark> & { selectedText: string }): Mark {
  const {
    id = `mark_${Math.random().toString(36).slice(2)}`,
    threadId = `thread_${Math.random().toString(36).slice(2)}`,
    path = "f.txt",
    versionId = "v1",
    selectedText,
    beforeContext = "",
    afterContext = "",
    comment = "test comment",
    label,
    createdAt = 1000,
    offset = 0,
    length = selectedText.length,
    status = "resolved",
    meta,
  } = overrides;
  return {
    id,
    threadId,
    path,
    versionId,
    selectedText,
    beforeContext,
    afterContext,
    comment,
    label,
    createdAt,
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      assertEquals(yield* files.getMarks("f.txt", v1), []);
    }),
  );
});

test("Files.getMarks -- returns all marks for a version in save order", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "hello" }));
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));

      const marks = yield* files.getMarks("f.txt", v1);
      assertEquals(marks.length, 2);
      assertEquals(marks[0].selectedText, "hello");
      assertEquals(marks[1].selectedText, "world");
    }),
  );
});

test("Files.deleteMark -- removes a mark", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      const mark = createMark({ versionId: v1, selectedText: "hello" });
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
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
          const v = (yield* files.write("f.txt", "the quick brown fox")).versionId;
          yield* files.saveMark(
            createMark({
              versionId: v,
              selectedText: "quick brown",
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
      yield* Effect.provideService(files.write("f.txt", "the quick brown fox"), WorkspaceId, {
        wsId: "ws-b",
      });

      const a = yield* Effect.provideService(
        Effect.gen(function* () {
          const versions = yield* files.getVersions("f.txt");
          return yield* files.getMarks("f.txt", versions[versions.length - 1].versionId);
        }),
        WorkspaceId,
        { wsId: "ws-a" },
      );
      const b = yield* Effect.provideService(
        Effect.gen(function* () {
          const versions = yield* files.getVersions("f.txt");
          return yield* files.getMarks("f.txt", versions[versions.length - 1].versionId);
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "hello", offset: 0 }));
      const v2 = (yield* files.write("f.txt", "hello beautiful world")).versionId;

      const marks = yield* files.getMarks("f.txt", v2);
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selectedText: "hello",
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));
      const v2 = (yield* files.write("f.txt", "hello beautiful world")).versionId;

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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));
      const v2 = (yield* files.write("f.txt", "hello")).versionId;

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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));
      const v2 = (yield* files.write("f.txt", "hello")).versionId;
      assertEquals((yield* files.getMarks("f.txt", v2))[0].status, "stale");

      const v3 = (yield* files.write("f.txt", "hello again")).versionId;
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      // Contexts like the mark tool captures them; the resolver re-anchors through matched contexts
      // when the selected text moved or returned.
      yield* files.saveMark(
        createMark({
          versionId: v1,
          selectedText: "hello",
          offset: 0,
          afterContext: " world",
        }),
      );
      yield* files.write("f.txt", "goodbye world");
      yield* files.revert("f.txt", v1);

      const file = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", file.versionId);
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selectedText: "hello",
        status: "resolved",
      });
    }),
  );
});

test("Files.migrateMarks -- re-anchors marks added to an old version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "hello", offset: 0 }));
      yield* files.write("f.txt", "hello beautiful world");

      // Added to v1 after the write, so the write migration missed it.
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.versionId);
      assertEquals(result, { migrated: 1, stale: 0 });
      assertEquals(marks.length, 2);
      assertObjectMatch(marks[1], {
        selectedText: "world",
        offset: 16,
        status: "resolved",
      });
      // Migration writes a new row on the new version: new id, same thread.
      const v1Marks = yield* files.getMarks("f.txt", v1);
      assertEquals(marks[1].threadId, v1Marks[1].threadId);
      assertNotEquals(marks[1].id, v1Marks[1].id);
    }),
  );
});

test("Files.migrateMarks -- skips marks already on the latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "hello", offset: 0 }));
      yield* files.write("f.txt", "hello there");

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.versionId);
      assertEquals(result, { migrated: 0, stale: 0 });
      assertEquals(marks.length, 1);
    }),
  );
});

test("Files.migrateMarks -- no-op when source version is latest", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "hello", offset: 0 }));

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
      const v1 = (yield* files.write("f.txt", "alpha beta")).versionId;
      yield* files.write("f.txt", "alpha gamma beta");
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "beta", offset: 6 }));

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.versionId);
      assertEquals(result, { migrated: 1, stale: 0 });
      assertEquals(marks.length, 1);
      assertObjectMatch(marks[0], {
        selectedText: "beta",
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
      const v1 = (yield* files.write("f.txt", "hello world")).versionId;
      yield* files.write("f.txt", "completely different");
      yield* files.saveMark(createMark({ versionId: v1, selectedText: "world", offset: 6 }));

      const result = yield* files.migrateMarks("f.txt", v1);
      const latest = yield* files.read("f.txt");
      const marks = yield* files.getMarks("f.txt", latest.versionId);
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
    const env = Layer.merge(kvLayer(kv), Layer.provide(Files.layerNoDeps, kvLayer(kv)));
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
    const manifestKeys = entries.filter((e) => e.key[e.key.length - 1] === "file:manifest");
    const chunkKeys = entries.filter((e) => e.key[e.key.length - 2] === "file:chunk");
    assertEquals(manifestKeys.length, 1);
    assertEquals(chunkKeys.length, 0, "small file must not write chunk keys");
  } finally {
    kv.close();
  }
});

test("Files -- large write inlines first chunk, rest as chunk keys", async () => {
  const content = largeContent();
  const kv = await openKv();
  try {
    const env = Layer.merge(kvLayer(kv), Layer.provide(Files.layerNoDeps, kvLayer(kv)));
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
    const manifestKeys = entries.filter((e) => e.key[e.key.length - 1] === "file:manifest");
    const chunkKeys = entries.filter((e) => e.key[e.key.length - 2] === "file:chunk");
    assertEquals(manifestKeys.length, 1);
    // Chunk 0 is inlined in the manifest; chunk keys start at index 1.
    const indices = chunkKeys.map((e) => Number(e.key[e.key.length - 1])).toSorted((a, b) => a - b);
    assertEquals(indices[0], 1);
    assert(chunkKeys.length > 1, "should produce multiple chunk keys");
    for (const e of chunkKeys) {
      const v = e.value as Uint8Array;
      assert(v.length <= 60 * 1024, "chunk must respect CHUNK_SIZE");
    }
  } finally {
    kv.close();
  }
});
