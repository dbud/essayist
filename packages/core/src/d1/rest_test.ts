import { assertEquals } from "@std/assert";
import { afterEach, test, vi } from "vitest";

import { d1RestDatabase } from "./rest.ts";

/** Stub the REST API, and return the bodies the adapter posts to it. */
function stubApi(): unknown[] {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return { json: async () => ({ success: true, result: [{ results: [] }, { results: [] }] }) };
  });
  return bodies;
}

const db = () => d1RestDatabase({ accountId: "a", databaseId: "d", apiToken: "t" });

afterEach(() => {
  vi.unstubAllGlobals();
});

test("d1RestDatabase -- a batch inlines its params, escaping quotes in text", async () => {
  const bodies = stubApi();
  const database = db();
  await database.batch([
    database.prepare("INSERT INTO t (a, b) VALUES (?, ?)").bind("Kellogg's 'model'", 3),
    database.prepare("UPDATE t SET a = ? WHERE b = ?").bind(null, 4),
  ]);
  assertEquals(bodies, [
    {
      sql:
        "INSERT INTO t (a, b) VALUES ('Kellogg''s ''model''', 3);\n" +
        "UPDATE t SET a = NULL WHERE b = 4",
    },
  ]);
});

test("d1RestDatabase -- a single statement binds its params", async () => {
  const bodies = stubApi();
  await db().prepare("SELECT * FROM t WHERE a = ?").bind("it's").all();
  assertEquals(bodies, [{ sql: "SELECT * FROM t WHERE a = ?", params: ["it's"] }]);
});
