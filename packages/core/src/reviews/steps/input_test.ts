import { assertEquals } from "@std/assert";
import type { ResolvedPrompts } from "@/config/types.ts";
import type { Artifact, Artifacts, ArtifactType } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { composeCallInput, composeRepairInput } from "./input.ts";

const PROMPTS: ResolvedPrompts = {
  system: "You are an editor.",
  directive: "Review the essay.",
  instructions: "Quote exact spans.",
};

function inputsOf(
  ...artifacts: Artifact<ReviewTypes>[]
): Artifacts<ReviewTypes> {
  const matching = <A extends ArtifactType<ReviewTypes>>(type: A) =>
    artifacts.filter(
      (artifact): artifact is Artifact<ReviewTypes, A> =>
        artifact.type === type,
    );
  return {
    all: artifacts,
    allOf: matching,
    of: (type) => matching(type).map((artifact) => artifact.data),
    one: (type) => {
      const matches = matching(type);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly one "${type}" artifact, got ${matches.length}`,
        );
      }
      return matches[0].data;
    },
  };
}

const ANALYSIS = {
  thesis: "Drafts are raw material.",
  claims: [],
  outline: [],
  strengths: [],
  risks: [],
};

Deno.test("composeCallInput -- prompts first, artifacts in order, essay last", () => {
  const input = composeCallInput(
    PROMPTS,
    inputsOf(
      { type: "analysis", data: ANALYSIS, producedBy: "analyze" },
      {
        type: "content",
        data: "     1: hello brave world",
        producedBy: "content",
      },
    ),
  );

  assertEquals(input.startsWith("You are an editor."), true);
  assertEquals(input.includes("## Analysis"), true);
  assertEquals(input.includes("Thesis: Drafts are raw material."), true);
  assertEquals(
    input.indexOf("## Analysis") < input.indexOf("## Essay (numbered lines)"),
    true,
  );
  assertEquals(input.endsWith("     1: hello brave world"), true);
});

Deno.test("composeCallInput -- renders every artifact in dependsOn order", () => {
  const input = composeCallInput(
    PROMPTS,
    inputsOf(
      {
        type: "analysis",
        data: { ...ANALYSIS, thesis: "first" },
        producedBy: "analyze",
      },
      {
        type: "analysis",
        data: { ...ANALYSIS, thesis: "second" },
        producedBy: "analyze2",
      },
      { type: "content", data: "essay", producedBy: "content" },
    ),
  );

  assertEquals(
    input.indexOf("Thesis: first") < input.indexOf("Thesis: second"),
    true,
  );
});

Deno.test("composeRepairInput -- windows content around the hinted line", () => {
  const essay = Array.from(
    { length: 20 },
    (_, i) => `${String(i + 1).padStart(6)}: line ${i + 1}`,
  ).join("\n");
  const failed = [
    {
      selected_text: "line 10",
      comment: "fix this",
      line_hint: 10,
      marked: false,
      error: "selected text not found",
    },
  ];

  const input = composeRepairInput(
    PROMPTS,
    inputsOf(
      { type: "content", data: essay, producedBy: "content" },
      { type: "mark.failed", data: failed, producedBy: "mechanics.apply" },
    ),
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
  const failed = [
    {
      selected_text: "nowhere to anchor",
      comment: "find it",
      marked: false,
      error: "selected text not found",
    },
  ];

  const input = composeRepairInput(
    PROMPTS,
    inputsOf(
      { type: "content", data: "     1: only line", producedBy: "content" },
      { type: "mark.failed", data: failed, producedBy: "mechanics.apply" },
    ),
  );

  assertEquals(input.includes("     1: only line"), true);
  assertEquals(input.includes("Content around line"), false);
});
