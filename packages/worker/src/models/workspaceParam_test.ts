import { expect, test } from "vitest";

import { workspaceIdOf, workspaceParam } from "./workspaceParam.ts";

const id = "9e8603b8-a704-43eb-87aa-e538bb6c6493";
const other = "1c2d3e4f-0000-4000-8000-000000000000";

test("names the workspace and the start of its id", () => {
  expect(workspaceParam(id, "My Essays")).toBe("my-essays-9e8603b8");
  expect(workspaceParam(id, "!!")).toBe("9e8603b8");
  expect(workspaceParam(id)).toBe("9e8603b8");
});

test("finds the workspace by the start of its id, whatever the name says", () => {
  expect(workspaceIdOf("my-essays-9e8603b8", [other, id])).toBe(id);
  expect(workspaceIdOf("an-old-name-9e8603b8", [other, id])).toBe(id);
  expect(workspaceIdOf("9e8603b8", [id])).toBe(id);
});

test("names nothing for a missing, unknown, short or shared start", () => {
  expect(workspaceIdOf(null, [id])).toBeNull();
  expect(workspaceIdOf("demo-00000000", [id])).toBeNull();
  expect(workspaceIdOf("demo-9e86", [id])).toBeNull();
  expect(workspaceIdOf("demo-9e8603b8", [id, `9e8603b8${other.slice(8)}`])).toBeNull();
});
