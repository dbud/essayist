import { useSignal } from "@preact/signals";
import type { StreamableOutputItem } from "@openrouter/agent";
import { useChat } from "@/utils/useChat.ts";

function renderItem(item: StreamableOutputItem) {
  switch (item.type) {
    case "function_call":
      return (
        <div class="flex items-start gap-2 my-2 text-sm">
          <span class="badge badge-info badge-sm">tool</span>
          <div>
            <code class="font-mono font-bold text-xs">{item.name}</code>
            {item.arguments && (
              <pre class="text-xs mt-1 opacity-70 overflow-x-auto">
                {item.arguments}
              </pre>
            )}
          </div>
        </div>
      );
    case "function_call_output":
      return (
        <div class="flex items-start gap-2 my-2 text-sm">
          <span class="badge badge-success badge-sm">result</span>
          <pre class="text-xs opacity-70 overflow-x-auto whitespace-pre-wrap">
            {typeof item.output === "string"
              ? item.output
              : JSON.stringify(item.output, null, 2)}
          </pre>
        </div>
      );
    case "reasoning": {
      // In-progress: text is in summary[].text
      // Completed: text is in content[].text
      const text = item.summary
        ?.filter((s) => s.type === "summary_text")
        .map((s) => s.text)
        .join("\n") ||
        item.content
          ?.filter((c) => c.type === "reasoning_text")
          .map((c) => c.text)
          .join("\n");
      if (!text) return null;
      return (
        <div class="my-2 text-sm opacity-60 italic border-l-2 border-base-300">
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
    <div class="card bg-base-200 shadow-xl max-w-2xl mx-auto h-[70vh] flex flex-col">
      <div class="card-body flex-1 flex flex-col min-h-0">
        <h2 class="card-title">Chat</h2>

        {/* Messages area */}
        <div class="flex-1 overflow-y-auto my-4 space-y-4 min-h-0">
          {messages.value.length === 0 && (
            <p class="text-base-content/50 text-center py-8">
              Send a message to start chatting
            </p>
          )}
          {messages.value.map((msgSig, i) => {
            const msg = msgSig.value!;
            return (
              <div
                key={i}
                class={`chat ${
                  msg.role === "user" ? "chat-end" : "chat-start"
                }`}
              >
                <div
                  class={`chat-bubble ${
                    msg.role === "user" ? "chat-bubble-primary" : "chat-bubble"
                  }`}
                >
                  {/* Tool calls and reasoning items */}
                  {Array.from(msg.items.entries()).map(([key, item]) => (
                    <div key={key}>{renderItem(item)}</div>
                  ))}

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input.value);
            input.value = "";
          }}
          class="flex gap-2"
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
  );
}
