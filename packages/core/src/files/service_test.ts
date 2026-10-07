import { assert, assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { kvLayer } from "@/persistence/kv_layer.ts";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
} from "@/persistence/mod.ts";
import { testLayer } from "@/persistence/testing/kv.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { Files } from "./service.ts";

type E = PersistenceError | ConcurrentModificationError;

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

Deno.test("Files.read -- full file (latest)", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("essay.txt", SAMPLE_ESSAY);
      const result = yield* files.read("essay.txt");
      assertEquals(result.content, SAMPLE_ESSAY);
      assertEquals(result.lines, 4);
      assertEquals(result.start_line, 1);
      assertEquals(result.end_line, 4);
    }),
  );
});

Deno.test("Files.read -- line range", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("essay.txt", SAMPLE_ESSAY);
      const result = yield* files.read("essay.txt", {
        startLine: 2,
        endLine: 3,
      });
      assertEquals(
        result.content,
        SAMPLE_ESSAY.split("\n").slice(1, 3).join("\n"),
      );
      assertEquals(result.lines, 4);
      assertEquals(result.start_line, 2);
      assertEquals(result.end_line, 3);
    }),
  );
});

Deno.test("Files.read -- numbered output", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("essay.txt", SAMPLE_ESSAY);
      const result = yield* files.read("essay.txt", {
        startLine: 1,
        endLine: 2,
        numbered: true,
      });
      assertEquals(result.content.split("\n"), [
        "     1: The quick brown fox jumps over the lazy dog.",
        "     2: This sentence contains every letter of the alphabet.",
      ]);
    }),
  );
});

Deno.test("Files.read -- missing file returns empty", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* files.read("missing.txt");
      assertEquals(result.content, "");
      assertEquals(result.version_id, "");
      assertEquals(result.lines, 0);
    }),
  );
});

Deno.test("Files.read -- clamps line range", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("essay.txt", SAMPLE_ESSAY);
      const result = yield* files.read("essay.txt", {
        startLine: -5,
        endLine: 100,
      });
      assertEquals(result.start_line, 1);
      assertEquals(result.end_line, 4);
    }),
  );
});

Deno.test("Files.read -- specific version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      yield* files.write("f.txt", "modified");
      const history = yield* files.getHistory("f.txt");
      assertEquals(history.length, 2);
      const original = yield* files.read("f.txt", {
        versionId: history[0].version_id,
      });
      assertEquals(original.content, "original");
      const latest = yield* files.read("f.txt", {
        versionId: history[1].version_id,
      });
      assertEquals(latest.content, "modified");
    }),
  );
});

Deno.test("Files.read -- unknown version returns empty miss", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "original");
      const miss = yield* files.read("f.txt", { versionId: "no_such_version" });
      assertEquals(miss.version_id, "");
      assertEquals(miss.content, "");
      assertEquals(miss.lines, 0);
    }),
  );
});

// list

Deno.test("Files.list -- all files", async () => {
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

Deno.test("Files.list -- with prefix", async () => {
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

Deno.test("Files.list -- empty", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      assertEquals(yield* files.list(), []);
    }),
  );
});

// history

Deno.test("Files.getHistory -- includes all versions including latest", async () => {
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

Deno.test("Files.getHistory -- versions are sorted by timestamp", async () => {
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

Deno.test("Files.getHistory -- includes line count per version", async () => {
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

// diff

Deno.test("Files.diff -- between versions", async () => {
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

Deno.test("Files.diff -- identical content produces empty diff", async () => {
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

Deno.test("Files -- large document roundtrips", async () => {
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

// storage layout: chunk 0 inlines in the manifest; the rest get chunk keys

Deno.test("Files -- small file inlines content in the latest key (no chunk keys)", async () => {
  const kv = await Deno.openKv(":memory:");
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

Deno.test("Files -- large write inlines first chunk, rest as chunk keys", async () => {
  const content = largeContent();
  const kv = await Deno.openKv(":memory:");
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
