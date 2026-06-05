import { signal, useSignal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { StreamableOutputItem } from "@openrouter/agent";
import { parseSSE } from "./sse.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  items: Map<string, StreamableOutputItem>;
}

function itemKey(item: StreamableOutputItem): string {
  const any = item as Record<string, unknown>;
  return (any.id as string) ?? (any.callId as string) ??
    Math.random().toString(36);
}

function newMessage(
  role: ChatMessage["role"],
  text = "",
): Signal<ChatMessage> {
  return signal<ChatMessage>({ role, text, items: new Map() });
}

export function useChat(apiUrl: string) {
  const messages = useSignal<Signal<ChatMessage>[]>([]);
  const streaming = useSignal(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    if (!text.trim() || streaming.value) return;

    const reply = newMessage("assistant");
    messages.value = [
      ...messages.value,
      newMessage("user", text),
      reply,
    ];
    streaming.value = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `${apiUrl}?message=${encodeURIComponent(text)}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      for await (const { event, data } of parseSSE(res.body!)) {
        if (event === "delta") {
          reply.value = {
            ...reply.value,
            text: reply.value.text + (data as { delta: string }).delta,
          };
        } else if (event === "item") {
          const item = data as StreamableOutputItem;
          reply.value = {
            ...reply.value,
            items: new Map(reply.value.items).set(itemKey(item), item),
          };
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        reply.value = {
          ...reply.value,
          text: reply.value.text + `\n\nError: ${String(err)}`,
        };
      }
    } finally {
      streaming.value = false;
      abortRef.current = null;
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  return { messages, streaming, send, abort };
}
