import { assertEquals, assertRejects } from "@std/assert";
import { SerialTasks } from "./serial.ts";

function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

Deno.test("SerialTasks -- runs tasks in call order", async () => {
  const order: string[] = [];
  const tasks = new SerialTasks();
  const results = await Promise.all([
    tasks.add(async () => {
      await delayed(undefined, 20);
      order.push("slow");
      return "slow";
    }),
    tasks.add(() => {
      order.push("fast");
      return Promise.resolve("fast");
    }),
  ]);
  assertEquals(order, ["slow", "fast"]);
  assertEquals(results, ["slow", "fast"]);
});

Deno.test("SerialTasks -- a failed task rejects its caller, not the queue", async () => {
  const tasks = new SerialTasks();
  const first = tasks.add(() => Promise.reject(new Error("boom")));
  const second = tasks.add(() => Promise.resolve("after"));
  await assertRejects(() => first, Error, "boom");
  assertEquals(await second, "after");
  await tasks.drain();
});
