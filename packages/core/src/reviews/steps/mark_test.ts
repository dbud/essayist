import { assertEquals } from "@std/assert";
import { PinnedVFS } from "@/vfs/pin.ts";
import { createFile } from "@/vfs/testing/helpers.ts";
import { applyMarks, type ProposedMarks, ProposedMarksSchema } from "./mark.ts";

const PROVENANCE = { runId: "run-1", unitId: "mechanics" };

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
    marks: [
      { selected_text: "brave", comment: "ghost span", label: "grammar" },
    ],
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

Deno.test("applyMarks -- every mark carries a label", () => {
  // A mark with no label would apply without the aspect check and render
  // without a badge, so the schema requires one.
  const parsed = ProposedMarksSchema.safeParse({
    marks: [{ selected_text: "hello", comment: "no label" }],
  });

  assertEquals(parsed.success, false);
});
