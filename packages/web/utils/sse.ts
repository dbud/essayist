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
