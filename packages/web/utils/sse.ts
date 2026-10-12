export type SSESend = (event: string, data: unknown) => void;

/**
 * Creates a text/event-stream Response. `run` receives the sender and
 * should settle when the stream is complete; events sent after the client
 * disconnects are dropped, and the run keeps going. `onCancel` fires when
 * the client disconnects.
 */
export function sseResponse(
  run: (send: SSESend) => Promise<void>,
  onCancel?: () => void | Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send: SSESend = (event, data) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          open = false;
        }
      };

      void run(send).finally(() => {
        open = false;
        try {
          controller.close();
        } catch {
          // Client already gone.
        }
      });
    },
    cancel() {
      open = false;
      return onCancel?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

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
