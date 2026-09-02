import type { ModelResult, Tool } from "@openrouter/agent";
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { Agent } from "@/agent.ts";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { runReviewPass } from "@/reviews/runner.ts";
import { ReviewStore } from "@/reviews/store.ts";
import { EventTraceStore } from "@/reviews/trace.ts";
import type { ReviewTraceSink, TracedReviewEvent } from "@/reviews/types.ts";
import type { ToolPrompt } from "@/tools/index.ts";
import { VirtualFileSystem } from "@/vfs/vfs.ts";

function fakeResult(
  text: string,
  onGetText?: () => Promise<void>,
): ModelResult<readonly Tool[]> {
  return {
    getText: () =>
      onGetText ? onGetText().then(() => text) : Promise.resolve(text),
    getTextStream: async function* () {
      yield text;
    },
    getItemsStream: async function* () {},
    getFullResponsesStream: async function* () {},
    cancel: () => {},
  } as unknown as ModelResult<readonly Tool[]>;
}

interface Captured {
  input: string;
  toolPrompts: readonly ToolPrompt[];
  models: string[];
  maxRounds: number;
}

function createMockAgent(
  responseText: string,
  onCall?: (c: Captured) => void,
  onGetText?: () => Promise<void>,
): Agent {
  return {
    callModelWithTools: (
      input: string,
      toolPrompts: readonly ToolPrompt[],
      models: string[],
      maxRounds: number,
      trace?: ReviewTraceSink,
    ) => {
      onCall?.({ input, toolPrompts, models, maxRounds });
      trace?.record({ type: "input", text: input });
      return fakeResult(responseText, onGetText);
    },
  } as unknown as Agent;
}

function createMockThrowingAgent(
  error: string,
  onGetText?: () => Promise<void>,
): Agent {
  return {
    callModelWithTools: () =>
      ({
        getText: () =>
          onGetText
            ? onGetText().then(() => Promise.reject(new Error(error)))
            : Promise.reject(new Error(error)),
        getTextStream: async function* () {},
        getItemsStream: async function* () {},
        getFullResponsesStream: async function* () {},
        cancel: () => {},
      }) as unknown as ModelResult<readonly Tool[]>,
  } as unknown as Agent;
}

const pass: ResolvedReviewPass = {
  reviewPass: {
    id: "essay-review",
    name: "Essay review",
    modelPoolId: "free-pool",
    systemPromptKey: "system.reviewer",
    directivePromptKey: "directive.review",
    instructionsPromptKey: "instructions.mark",
    enabledTools: ["read_file", "list_files", "grep", "mark"],
    allowedCategoryIds: ["thesis", "evidence"],
    maxRounds: 5,
  },
  modelRefs: ["m/a", "m/b"],
  apiKeyEnvKey: "OPENROUTER_API_KEY",
  systemPrompt: "You are an editor.",
  directive:
    'Review the file "{{file}}". Read it, then mark issues using the allowed labels.',
  instructions: "Mark issues.",
  categories: [],
  allowedLabels: ["thesis", "evidence"],
};

function setup() {
  const adapter = new InMemoryAdapter();
  const vfs = new VirtualFileSystem(adapter, "ws");
  const reviewStore = new ReviewStore(adapter);
  const traceStore = new EventTraceStore(adapter);
  return { adapter, vfs, reviewStore, traceStore };
}

Deno.test("runReviewPass -- completes a run with the agent summary", async () => {
  const { vfs, reviewStore, traceStore } = setup();
  await vfs.write("essay.txt", "hello world");
  const versionId = (await vfs.read("essay.txt")).version_id;
  let captured: Captured | undefined;
  const agent = createMockAgent("Strong thesis; evidence needs work.", (c) => {
    captured = c;
  });

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass,
    workspaceId: "ws",
    fileId: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Strong thesis; evidence needs work.");
  assertEquals(run.fileId, "essay.txt");
  assertEquals(run.reviewPassId, "essay-review");
  assertEquals(run.versionId, versionId);

  const stored = await reviewStore.getRun({ workspaceId: "ws", id: run.id });
  assertEquals(stored?.status, "completed");

  if (!captured) throw new Error("agent was not called");
  assertStringIncludes(captured.input, "You are an editor.");
  assertStringIncludes(captured.input, "Mark issues.");
  assertStringIncludes(captured.input, 'Review the file "essay.txt"');

  assertEquals(captured.models, ["m/a", "m/b"]);
  assertEquals(captured.maxRounds, 5);

  const names = captured.toolPrompts.map(
    (tp) => (tp.tool as { function: { name: string } }).function.name,
  );
  assertEquals(names, ["read_file", "list_files", "grep", "mark"]);
  const mark = captured.toolPrompts.find(
    (tp) =>
      (tp.tool as { function: { name: string } }).function.name === "mark",
  );
  if (!mark) throw new Error("mark tool not built");
  assertStringIncludes(
    (mark.tool as { function: { description: string } }).function.description,
    "Allowed labels: thesis, evidence",
  );

  const trace = await traceStore.get({ workspaceId: "ws", runId: run.id });
  assertEquals(
    trace?.map((e) => e.type),
    ["input"],
  );
  const inputEvent = trace?.[0] as TracedReviewEvent;
  assertStringIncludes(
    (inputEvent as { text: string }).text,
    "You are an editor.",
  );
});

Deno.test("runReviewPass -- records a failed run on agent error", async () => {
  const { vfs, reviewStore, traceStore } = setup();
  await vfs.write("essay.txt", "hello world");
  const agent = createMockThrowingAgent("upstream down");

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass,
    workspaceId: "ws",
    fileId: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error, "upstream down");
  assertEquals(typeof run.versionId, "string");
  assertEquals(
    (await reviewStore.getRun({ workspaceId: "ws", id: run.id }))?.status,
    "failed",
  );

  const trace = await traceStore.get({ workspaceId: "ws", runId: run.id });
  const error = trace?.[0] as Extract<TracedReviewEvent, { type: "error" }>;
  assertEquals(error.type, "error");
  assertEquals(error.error, "upstream down");
});

Deno.test("runReviewPass -- fails fast when the file does not exist", async () => {
  const { vfs, reviewStore } = setup();

  const run = await runReviewPass({
    agent: createMockAgent("unused"),
    vfs,
    reviewStore,
    pass,
    workspaceId: "ws",
    fileId: "ghost.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error, "File not found: ghost.txt");
  assertEquals(run.versionId, undefined);
  assertEquals(
    (await reviewStore.getRun({ workspaceId: "ws", id: run.id }))?.status,
    "failed",
  );
});

Deno.test("runReviewPass -- commits pinned marks onto latest moved mid-run", async () => {
  const { vfs, reviewStore } = setup();
  await vfs.write("essay.txt", "hello world");
  await vfs.write("essay.txt", "hello beautiful world");
  const pinnedVersionId = (await vfs.read("essay.txt")).version_id;

  // While the agent works, the user saves and the agent marks the pinned version.
  const agent = createMockAgent("summary", undefined, async () => {
    await vfs.write("essay.txt", "hello amazing world");
    await vfs.mark("essay.txt", "hello", "greeting", {
      versionId: pinnedVersionId,
    });
  });

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    pass,
    workspaceId: "ws",
    fileId: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.versionId, pinnedVersionId);

  const latest = await vfs.read("essay.txt");
  const marks = await vfs.getMarks("essay.txt", latest.version_id);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].status, "resolved");
  assertEquals(marks[0].comment, "greeting");
});

Deno.test("runReviewPass -- commits marks placed before a failure", async () => {
  const { vfs, reviewStore } = setup();
  await vfs.write("essay.txt", "hello world");
  const versionId = (await vfs.read("essay.txt")).version_id;

  const agent = createMockThrowingAgent("upstream down", async () => {
    await vfs.mark("essay.txt", "hello", "greeting", { versionId });
  });

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    pass,
    workspaceId: "ws",
    fileId: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error, "upstream down");
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks.length, 1);
});
