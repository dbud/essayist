import { getCapital } from "@essayist/core";
import { assertMatch } from "@std/assert";
import { assertRejects } from "@std/assert/rejects";
import { createAgent } from "./utils.ts";

const agent = createAgent();

Deno.test.ignore("getCapital returns 'Paris' for France", async () => {
  const capital = await getCapital("France", agent);
  assertMatch(capital, /paris/i);
});

Deno.test.ignore("getCapital throws for a fictitious country", async () => {
  await assertRejects(
    () => getCapital("Zylophrax", agent),
    Error,
    "Model returned failure",
  );
});
