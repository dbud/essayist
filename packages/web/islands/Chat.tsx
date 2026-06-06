import { useSignal } from "@preact/signals";
import type { StreamableOutputItem } from "@openrouter/agent";
import { useChat } from "@/utils/useChat.ts";

function pprint<T>(a: string | T) {
  const object = typeof a === "string" ? JSON.parse(a) : a;
  return JSON.stringify(object, null, 2);
}

function renderItem(item: StreamableOutputItem) {
  switch (item.type) {
    case "function_call":
      return (
        <div class="flex flex-col gap-2">
          <span class="badge badge-info badge-sm font-mono">
            {item.name}
          </span>
          <div class="whitespace-pre-wrap text-xs font-mono">
            {pprint(item.arguments)}
          </div>
        </div>
      );
    case "function_call_output":
      return (
        <div class="flex flex-col gap-2">
          <span class="badge badge-success badge-sm">result</span>
          <div class="font-mono whitespace-pre-wrap text-xs">
            {pprint(item.output)}
          </div>
        </div>
      );
    case "reasoning": {
      const text = [
        ...(item.summary?.filter((s) => s.type === "summary_text") ?? []),
        ...(item.content?.filter((c) => c.type === "reasoning_text") ?? []),
      ].map((s) => s.text).join("\n");
      return (
        <div class="opacity-60 italic text-sm">
          {text}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function Chat() {
  const { messages, streaming, send } = useChat("/api/chat");
  const input = useSignal("");

  return (
    <div class="card bg-base-100 card-border border-base-300 max-w-2xl max-h-[70vh] flex flex-col overflow-hidden">
      <div class="card-body flex-1 flex flex-col p-0 min-h-0">
        {/* Messages area */}
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.value.length === 0 && (
            <div class="flex flex-col items-center justify-center h-full text-base-content/50">
              <p class="text-center">Send a message to start chatting</p>
            </div>
          )}
          {messages.value.map((msgSig, i) => {
            const msg = msgSig.value!;
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                class={`chat ${isUser ? "chat-end" : "chat-start"}`}
              >
                {/* Bubble */}
                <div
                  class={`chat-bubble ${
                    isUser ? "chat-bubble-primary" : "chat-bubble"
                  }`}
                >
                  {/* Tool calls and reasoning items */}
                  <div class="flex flex-col gap-4">
                    {Array.from(msg.items.entries()).map(([key, item]) => (
                      <div key={key}>{renderItem(item)}</div>
                    ))}
                  </div>

                  {/* Text content */}
                  {msg.text && (
                    <div class="whitespace-pre-wrap">{msg.text}</div>
                  )}

                  {/* Streaming indicator */}
                  {i === messages.value.length - 1 && streaming.value &&
                    !msg.text && (
                    <span class="loading loading-dots loading-sm"></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input area */}
        <div class="bg-base-300 flex p-4">
          <form
            class="grow flex gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(input.value);
              input.value = "";
            }}
          >
            <input
              type="text"
              value={input.value}
              onInput={(e) => input.value = e.currentTarget.value}
              placeholder="Type a message..."
              class="input input-bordered flex-1"
              disabled={streaming.value}
            />
            <button
              type="submit"
              class="btn btn-primary"
              disabled={streaming.value || !input.value.trim()}
            >
              {streaming.value
                ? <span class="loading loading-spinner loading-sm"></span>
                : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
