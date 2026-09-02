import { assertEquals } from "@std/assert";
import { ToolNameSchema } from "@/config/types.ts";
import { getToolInfos, TOOL_DEFINITIONS } from "./registry.ts";

Deno.test("getToolInfos -- exposes every registered tool", () => {
  const infos = getToolInfos();
  assertEquals(
    infos.map((tool) => tool.name),
    ["read_file", "list_files", "grep", "mark", "write_file"],
  );
  for (const info of infos) {
    assertEquals(typeof info.description, "string");
    assertEquals(typeof info.instruction, "string");
  }
});

Deno.test("ToolNameSchema -- matches the registered tool names", () => {
  assertEquals(
    [...ToolNameSchema.options],
    TOOL_DEFINITIONS.map((definition) => definition.name),
  );
});

Deno.test("getToolInfos -- mark parameters reflect the batch schema", () => {
  const mark = getToolInfos().find((tool) => tool.name === "mark");
  const parameters = mark?.parameters as {
    properties: { marks?: { type: string } };
    required: string[];
  };
  assertEquals(parameters.properties.marks?.type, "array");
  assertEquals(parameters.required.includes("marks"), true);
  assertEquals(parameters.required.includes("path"), true);
});
