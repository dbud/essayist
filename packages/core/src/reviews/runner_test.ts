import type { ModelResult, Tool } from "@openrouter/agent";
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { Agent } from "@/agent.ts";
import type { ResolvedReviewPass } from "@/config/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { runReviewPass } from "@/reviews/runner.ts";
import { ReviewStore } from "@/reviews/store.ts";
import type { ToolPrompt } from "@/tools/index.ts";
import { VirtualFileSystem } from "@/vfs/vfs.ts";

function fakeResult(text: string): ModelResult<readonly Tool[]> {
  return {
    getText: () => Promise.resolve(text),
    getTextStream: async function* () {
      yield text;
    },
    getItemsStream: async function* () {},
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
): Agent {
  return {
    callModelWithTools: (
      input: string,
      toolPrompts: readonly ToolPrompt[],
      models: string[],
      maxRounds: number,
    ) => {
      onCall?.({ input, toolPrompts, models, maxRounds });
      return fakeResult(responseText);
    },
  } as unknown as Agent;
}

function createMockThrowingAgent(error: string): Agent {
  return {
    callModelWithTools: () =>
      ({
        getText: () => Promise.reject(new Error(error)),
        getTextStream: async function* () {},
        getItemsStream: async function* () {},
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
  return { adapter, vfs, reviewStore };
}

Deno.test("runReviewPass -- completes a run with the agent summary", async () => {
  const { vfs, reviewStore } = setup();
  let captured: Captured | undefined;
  const agent = createMockAgent("Strong thesis; evidence needs work.", (c) => {
    captured = c;
  });

  const run = await runReviewPass(
    agent,
    vfs,
    reviewStore,
    pass,
    "ws",
    "essay.txt",
  );

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Strong thesis; evidence needs work.");
  assertEquals(run.fileId, "essay.txt");
  assertEquals(run.reviewPassId, "essay-review");

  const stored = await reviewStore.getRun("ws", run.id);
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
});

Deno.test("runReviewPass -- records a failed run on agent error", async () => {
  const { vfs, reviewStore } = setup();
  const agent = createMockThrowingAgent("upstream down");

  const run = await runReviewPass(
    agent,
    vfs,
    reviewStore,
    pass,
    "ws",
    "essay.txt",
  );

  assertEquals(run.status, "failed");
  assertEquals(run.error, "upstream down");
  assertEquals((await reviewStore.getRun("ws", run.id))?.status, "failed");
});
