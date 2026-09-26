import { assertEquals } from "@std/assert";
import type { ResolvedStep } from "@/config/types.ts";
import type { MarkAttempt } from "@/reviews/types.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import { createFile } from "@/vfs/testing/helpers.ts";
import { composeRepairInput } from "./compose.ts";
import { applyMarks, type ProposedMarks } from "./mark.ts";

const PROVENANCE = { runId: "run-1", stepId: "mechanics" };

function resolved(): ResolvedStep {
  return {
    step: {
      id: "mechanics",
      name: "Mechanics",
      kind: "mark",
      systemPromptKey: "sys",
      directivePromptKey: "dir",
    },
    modelRefs: ["m/a"],
    apiKeyEnvKey: "KEY",
    systemPrompt: "You are an editor.",
    directive: "Scan for grammar faults.",
    instructions: "Quote exact spans.",
    categories: [],
    allowedLabels: ["grammar"],
  };
}

Deno.test("applyMarks -- places marks on the pinned version", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  await vfs.write("essay.txt", "a newer version");
  const proposed: ProposedMarks = {
    marks: [
      {
        selected_text: "brave",
        comment: "Adjective earns its place.",
        label: "grammar",
      },
    ],
  };

  const attempts = await applyMarks(pinned, proposed, ["grammar"], PROVENANCE);

  assertEquals(attempts.length, 1);
  assertEquals(attempts[0].marked, true);
  assertEquals(attempts[0].selected_text, "brave");
  assertEquals(attempts[0].comment, "Adjective earns its place.");
  assertEquals(attempts[0].label, "grammar");
  assertEquals(typeof attempts[0].mark_id, "string");
  assertEquals(typeof attempts[0].thread_id, "string");
  // The mark landed on the pinned version; the newer write has none.
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "brave");
  assertEquals(marks[0].meta, PROVENANCE);
  const latest = await vfs.read("essay.txt");
  assertEquals(await vfs.getMarks("essay.txt", latest.version_id), []);
});

Deno.test("applyMarks -- failed spans keep an error", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  const proposed: ProposedMarks = {
    marks: [{ selected_text: "brave", comment: "ghost span" }],
  };

  const attempts = await applyMarks(pinned, proposed, [], PROVENANCE);

  assertEquals(attempts[0].marked, false);
  assertEquals(attempts[0].error, "selected text not found");
});

Deno.test("applyMarks -- rejects labels outside the allowed set", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  const proposed: ProposedMarks = {
    marks: [{ selected_text: "hello", comment: "wrong label", label: "tone" }],
  };

  const attempts = await applyMarks(pinned, proposed, ["grammar"], PROVENANCE);

  assertEquals(attempts[0].marked, false);
  assertEquals(
    attempts[0].error,
    'label "tone" is not allowed; use one of: grammar',
  );
});

Deno.test("composeRepairInput -- windows content around the hinted line", () => {
  const essay = Array.from(
    { length: 20 },
    (_, i) => `${String(i + 1).padStart(6)}: line ${i + 1}`,
  ).join("\n");
  const failed: MarkAttempt[] = [
    {
      selected_text: "line 10",
      comment: "fix this",
      line_hint: 10,
      marked: false,
      error: "selected text not found",
    },
  ];

  const input = composeRepairInput(
    { system: resolved().systemPrompt, instructions: resolved().instructions },
    essay,
    failed,
  );

  assertEquals(input.includes("You are an editor."), true);
  assertEquals(input.includes('Attempted span: "line 10"'), true);
  assertEquals(input.includes("Error: selected text not found"), true);
  assertEquals(input.includes("Content around line 10:"), true);
  // Window covers lines 5..15; line 4 and line 16 are outside.
  assertEquals(input.includes("line 5"), true);
  assertEquals(input.includes("line 15"), true);
  assertEquals(input.includes("line 4:"), false);
  assertEquals(input.includes("line 16:"), false);
});

Deno.test("composeRepairInput -- attempts without a hint get the full essay", () => {
  const failed: MarkAttempt[] = [
    {
      selected_text: "nowhere to anchor",
      comment: "find it",
      marked: false,
      error: "selected text not found",
    },
  ];

  const input = composeRepairInput(
    { system: resolved().systemPrompt, instructions: resolved().instructions },
    "     1: only line",
    failed,
  );

  assertEquals(input.includes("     1: only line"), true);
  assertEquals(input.includes("Content around line"), false);
});
