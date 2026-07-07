import { extractProviderError } from "@essayist/core";
import type { ModelResult, Tool } from "@openrouter/agent";

async function* chunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

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
  let buffer = "";

  for await (const chunk of chunks(stream)) {
    buffer += chunk;

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
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
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

      // If either stream rejects (e.g. the provider returns a 429),
      // surface a structured error event to the client instead of
      // letting the response stream terminate abruptly. The generic
      // SDK message ("Provider returned error") is not useful to
      // users; extractProviderError pulls out the provider's raw
      // explanation from err.error.metadata.raw.
      try {
        await Promise.all([textPromise, itemsPromise]);
      } catch (err) {
        send("error", extractProviderError(err));
      } finally {
        send("done", {});
        controller.close();
      }
    },
    async cancel() {
      await result.cancel();
    },
  });
}
