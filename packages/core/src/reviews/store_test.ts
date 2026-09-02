import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { ReviewStore } from "./store.ts";

function createStore() {
  return new ReviewStore(new InMemoryAdapter());
}

Deno.test("ReviewStore -- createRun + getRun", async () => {
  const store = createStore();
  const run = await store.createRun({
    workspaceId: "ws",
    fileId: "essay.txt",
    reviewPassId: "essay-review",
  });
  assertEquals(run.status, "running");
  assertEquals(run.fileId, "essay.txt");
  assertEquals(run.reviewPassId, "essay-review");

  const fetched = await store.getRun({ workspaceId: "ws", id: run.id });
  assertEquals(fetched?.id, run.id);
});

Deno.test("ReviewStore -- createRun stores versionId when given", async () => {
  const store = createStore();
  const run = await store.createRun({
    workspaceId: "ws",
    fileId: "essay.txt",
    reviewPassId: "essay-review",
    versionId: "v1",
  });
  assertEquals(run.versionId, "v1");

  const plain = await store.createRun({
    workspaceId: "ws",
    fileId: "essay.txt",
    reviewPassId: "essay-review",
  });
  assertEquals(plain.versionId, undefined);
});

Deno.test("ReviewStore -- completeRun sets status, summary, completedAt", async () => {
  const store = createStore();
  const run = await store.createRun({
    workspaceId: "ws",
    fileId: "essay.txt",
    reviewPassId: "pass",
  });

  const completed = await store.completeRun({
    workspaceId: "ws",
    id: run.id,
    summary: "Looks good.",
  });
  assertEquals(completed?.status, "completed");
  assertEquals(completed?.summary, "Looks good.");
  assertEquals(typeof completed?.completedAt, "number");
  assertEquals(
    (await store.getRun({ workspaceId: "ws", id: run.id }))?.status,
    "completed",
  );
});

Deno.test("ReviewStore -- failRun sets status and error", async () => {
  const store = createStore();
  const run = await store.createRun({
    workspaceId: "ws",
    fileId: "essay.txt",
    reviewPassId: "pass",
  });

  const failed = await store.failRun({
    workspaceId: "ws",
    id: run.id,
    error: "boom",
  });
  assertEquals(failed?.status, "failed");
  assertEquals(failed?.error, "boom");
});

Deno.test("ReviewStore -- completeRun/failRun unknown id return undefined", async () => {
  const store = createStore();
  assertEquals(
    await store.completeRun({ workspaceId: "ws", id: "nope", summary: "x" }),
    undefined,
  );
  assertEquals(
    await store.failRun({ workspaceId: "ws", id: "nope", error: "x" }),
    undefined,
  );
});

Deno.test("ReviewStore -- listRuns newest first", async () => {
  const store = createStore();
  const a = await store.createRun({
    workspaceId: "ws",
    fileId: "a.txt",
    reviewPassId: "pass",
    startedAt: 100,
  });
  const b = await store.createRun({
    workspaceId: "ws",
    fileId: "b.txt",
    reviewPassId: "pass",
    startedAt: 200,
  });

  const runs = await store.listRuns({ workspaceId: "ws" });
  assertEquals(runs.length, 2);
  assertEquals(runs[0].id, b.id);
  assertEquals(runs[1].id, a.id);
});

Deno.test("ReviewStore -- listRuns filters by fileId", async () => {
  const store = createStore();
  const a = await store.createRun({
    workspaceId: "ws",
    fileId: "a.txt",
    reviewPassId: "pass",
    startedAt: 100,
  });
  await store.createRun({
    workspaceId: "ws",
    fileId: "b.txt",
    reviewPassId: "pass",
    startedAt: 200,
  });
  const a2 = await store.createRun({
    workspaceId: "ws",
    fileId: "a.txt",
    reviewPassId: "pass",
    startedAt: 300,
  });

  const aRuns = await store.listRuns({ workspaceId: "ws", fileId: "a.txt" });
  assertEquals(aRuns.length, 2);
  assertEquals(aRuns[0].id, a2.id);
  assertEquals(aRuns[1].id, a.id);

  const bRuns = await store.listRuns({ workspaceId: "ws", fileId: "b.txt" });
  assertEquals(bRuns.length, 1);
});

Deno.test("ReviewStore -- listRuns is workspace-scoped", async () => {
  const store = createStore();
  await store.createRun({
    workspaceId: "ws1",
    fileId: "a.txt",
    reviewPassId: "pass",
  });
  await store.createRun({
    workspaceId: "ws2",
    fileId: "b.txt",
    reviewPassId: "pass",
  });
  assertEquals((await store.listRuns({ workspaceId: "ws1" })).length, 1);
  assertEquals((await store.listRuns({ workspaceId: "ws2" })).length, 1);
});
