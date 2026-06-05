import type { ModelResult, Tool } from "@openrouter/agent";

/**
 * Parse a ReadableStream of SSE (Server-Sent Events) chunks into
 * typed { event, data } objects.
 *
 * Usage:
 *   for await (const { event, data } of parseSSE(stream)) {
 *     if (event === "delta") { ... }
 *   }
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: unknown }> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      if (!raw.trim()) continue;

      const eventMatch = raw.match(/^event: (.+)$/m);
      const dataMatch = raw.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) continue;

      yield {
        event: eventMatch[1],
        data: JSON.parse(dataMatch[1]),
      };
    }
  }
}

/**
 * Stream a ModelResult as a ReadableStream of SSE events.
 * Yields text deltas, item updates (tool calls, results, reasoning),
 * and a final done event.
 */
export function streamModelResultSSE<TTools extends readonly Tool[]>(
  result: ModelResult<TTools>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      const textPromise = (async () => {
        for await (const delta of result.getTextStream()) {
          send("delta", { delta });
        }
      })();

      const itemsPromise = (async () => {
        for await (const item of result.getItemsStream()) {
          send("item", item);
        }
      })();

      await Promise.all([textPromise, itemsPromise]);
      send("done", {});
      controller.close();
    },
    async cancel() {
      await result.cancel();
    },
  });
}
