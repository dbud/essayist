import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { test } from "vitest";
import { Files } from "@/files/service.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { testLayer } from "@/persistence/testing/kv.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { Search } from "./service.ts";

type E = PersistenceError | ConcurrentModificationError;

const run = <A>(
  program: Effect.Effect<A, E, Files | Search | WorkspaceId>,
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      Effect.provideService(program, WorkspaceId, { wsId: "default" }),
      testLayer(
        Layer.merge(
          Layer.provide(Search.layerNoDeps, Files.layerNoDeps),
          Files.layerNoDeps,
        ),
      ),
    ),
  );

// grep

test("Search.grep -- finds matches across files", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("a.txt", "hello world\nfoo bar\nhello again");
      yield* files.write("b.txt", "no match here\nhello from b");
      const search = yield* Search;

      const result = yield* search.grep("hello");
      assertEquals(result.matches, [
        {
          path: "a.txt",
          line_number: 1,
          line: "hello world",
          before: [],
          after: ["foo bar", "hello again"],
        },
        {
          path: "a.txt",
          line_number: 3,
          line: "hello again",
          before: ["hello world", "foo bar"],
          after: [],
        },
        {
          path: "b.txt",
          line_number: 2,
          line: "hello from b",
          before: ["no match here"],
          after: [],
        },
      ]);
    }),
  );
});

test("Search.grep -- case insensitive by default", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "Hello world\nfoo bar\nhello again");
      const search = yield* Search;

      const result = yield* search.grep("hello");
      assertEquals(result.matches, [
        {
          path: "f.txt",
          line_number: 1,
          line: "Hello world",
          before: [],
          after: ["foo bar", "hello again"],
        },
        {
          path: "f.txt",
          line_number: 3,
          line: "hello again",
          before: ["Hello world", "foo bar"],
          after: [],
        },
      ]);
    }),
  );
});

test("Search.grep -- case sensitive", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "Hello world\nfoo bar\nhello again");
      const search = yield* Search;

      const result = yield* search.grep("hello", { caseSensitive: true });
      assertEquals(result.matches, [
        {
          path: "f.txt",
          line_number: 3,
          line: "hello again",
          before: ["Hello world", "foo bar"],
          after: [],
        },
      ]);
    }),
  );
});

test("Search.grep -- with context lines", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "a\nb\nMATCH\nd\ne");
      const search = yield* Search;

      const result = yield* search.grep("MATCH");
      assertEquals(result.matches, [
        {
          path: "f.txt",
          line_number: 3,
          line: "MATCH",
          before: ["a", "b"],
          after: ["d", "e"],
        },
      ]);
    }),
  );
});

test("Search.grep -- filters to specific path", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("a.txt", "target");
      yield* files.write("b.txt", "target");
      const search = yield* Search;

      const result = yield* search.grep("target", { path: "a.txt" });
      assertEquals(result.matches, [
        {
          path: "a.txt",
          line_number: 1,
          line: "target",
          before: [],
          after: [],
        },
      ]);
    }),
  );
});

test("Search.grep -- path as directory prefix", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("notes/a.txt", "hello world");
      yield* files.write("notes/b.txt", "goodbye world");
      yield* files.write("other/c.txt", "no match");
      const search = yield* Search;

      const result = yield* search.grep("world", { path: "notes/" });
      assertEquals(result.matches.length, 2);
      assertEquals(result.matches[0].path, "notes/a.txt");
      assertEquals(result.matches[1].path, "notes/b.txt");
    }),
  );
});

test("Search.grep -- max results", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("a.txt", "x\nx\nx\nx");
      yield* files.write("b.txt", "x\nx\nx");
      const search = yield* Search;

      const result = yield* search.grep("x", { maxResults: 3 });
      assertEquals(result.matches.length, 3);
    }),
  );
});

test("Search.grep -- skips empty files", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("empty.txt", "");
      yield* files.write("f.txt", "hello world");
      const search = yield* Search;

      const result = yield* search.grep("hello");
      assertEquals(result.matches.length, 1);
      assertEquals(result.matches[0].path, "f.txt");
    }),
  );
});

test("Search.grep -- invalid regex falls back to literal", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "hello [world]");
      const search = yield* Search;

      const result = yield* search.grep("[world");
      assertEquals(result.matches.length, 1);
    }),
  );
});

// search

test("Search.search -- plain text with special chars", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "price is $5.00 today");
      const search = yield* Search;

      const result = yield* search.search("$5.00");
      assertEquals(result.matches.length, 1);
      assertEquals(result.matches[0].line, "price is $5.00 today");
    }),
  );
});

test("Search.search -- plain text with regex metacharacters", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("f.txt", "use [bracket] or (paren) or ^caret");
      const search = yield* Search;

      const result = yield* search.search("[bracket]");
      assertEquals(result.matches.length, 1);
    }),
  );
});

test("Search.search -- delegates to grep with escaped pattern", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.write("a.txt", "hello world");
      yield* files.write("b.txt", "goodbye world");
      const search = yield* Search;

      const result = yield* search.search("world");
      assertEquals(result.matches.length, 2);
    }),
  );
});
