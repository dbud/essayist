import { assertEquals } from "@std/assert";
import { delay } from "./delay.ts";
import { parseSSE, sseResponse } from "./sse.ts";

Deno.test("sseResponse -- sends events and closes after run settles", async () => {
  const res = sseResponse(async (send) => {
    send("progress", { phase: "reading" });
    await delay(1);
    send("done", { ok: true });
  });

  assertEquals(res.headers.get("Content-Type"), "text/event-stream");
  assertEquals(res.headers.get("Cache-Control"), "no-cache");

  const body = res.body;
  if (!body) throw new Error("no body");

  const events: { event: string; data: unknown }[] = [];
  for await (const { event, data } of parseSSE(body)) {
    events.push({ event, data });
  }
  assertEquals(events, [
    { event: "progress", data: { phase: "reading" } },
    { event: "done", data: { ok: true } },
  ]);
});

Deno.test("sseResponse -- a disconnect does not break the running task", async () => {
  let ticks = 0;
  const res = sseResponse(async (send) => {
    for (let i = 0; i < 3; i++) {
      send("tick", { i });
      ticks++;
      await delay(5);
    }
  });

  const body = res.body;
  if (!body) throw new Error("no body");
  const reader = body.getReader();
  await reader.read();
  await reader.cancel();

  // The task must finish without throwing on dropped sends.
  await delay(80);
  assertEquals(ticks, 3);
});
