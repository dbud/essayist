import { assert, assertEquals } from "@std/assert";
import { Effect, Exit, Schedule } from "effect";

Deno.test("Effect runs under Deno", async () => {
  const result = await Effect.runPromise(Effect.succeed(42));
  assertEquals(result, 42);
});

Deno.test("Effect.retry re-issues failures until success", async () => {
  let attempts = 0;
  const program = Effect.retry(
    Effect.suspend((): Effect.Effect<string, Error> => {
      attempts++;
      if (attempts < 3) return Effect.fail(new Error("transient"));
      return Effect.succeed("done");
    }),
    Schedule.exponential("1 millis", 2),
  );

  assertEquals(await Effect.runPromise(program), "done");
  assertEquals(attempts, 3);
});

Deno.test("Effect.retry keeps the failure after the schedule exhausts", async () => {
  let attempts = 0;
  const program = Effect.retry(
    Effect.suspend((): Effect.Effect<string, Error> => {
      attempts++;
      return Effect.fail(new Error("still failing"));
    }),
    Schedule.recurs(1),
  );

  const exit = await Effect.runPromiseExit(program);
  assert(Exit.isFailure(exit));
  assertEquals(attempts, 2);
});
