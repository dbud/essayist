import type { ProviderError } from "@essayist/core";
import { providerErrorDetail, providerErrorLabel } from "@essayist/core";
import type { StreamableOutputItem } from "@openrouter/agent";
import { useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import MarkdownView from "@/components/MarkdownView.tsx";
import { useChat } from "@/hooks/useChat.ts";
import { currentWorkspaceId } from "@/signals/workspace.ts";

function pprint<T>(a: string | T) {
  let object: unknown;
  if (typeof a === "string") {
    try {
      object = JSON.parse(a);
    } catch {
      return a;
    }
  } else {
    object = a;
  }
  return JSON.stringify(object, null, 2);
}

function ErrorMessage({ error }: { error: ProviderError }) {
  const label = providerErrorLabel(error);
  const detail = providerErrorDetail(error);
  return (
    <div class="alert alert-error text-xs flex flex-col items-start gap-1 py-2 px-3">
      <div class="font-semibold">{label}</div>
      <div class="whitespace-pre-wrap break-words">{detail}</div>
      {error.providerName && (
        <div class="opacity-70">provider: {error.providerName}</div>
      )}
    </div>
  );
}

function renderItem(item: StreamableOutputItem) {
  switch (item.type) {
    case "function_call":
      return (
        <div class="flex flex-col gap-2">
          <span class="badge badge-info badge-sm font-mono">{item.name}</span>
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
      ]
        .map((s) => s.text)
        .join("\n");
      return <div class="opacity-60 italic">{text}</div>;
    }
    default:
      return null;
  }
}

export default function Chat() {
  const { messages, streaming, send } = useChat(
    () =>
      `/api/workspaces/${encodeURIComponent(currentWorkspaceId.value)}/chat`,
  );
  const input = useSignal("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messageCount = useComputed(() => messages.value.length);
  const lastText = useComputed(() => {
    const last = messages.value[messages.value.length - 1];
    return last?.value.text ?? "";
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount.value, lastText.value, streaming.value]);

  return (
    <div class="flex-1 min-h-0 max-h-[50vh] flex flex-col">
      <div class="flex flex-1 flex-col gap-2 min-h-0">
        {/* Messages area */}
        {messages.value.length > 0 && (
          <div
            ref={scrollRef}
            class="text-sm flex-1 overflow-y-auto space-y-4 min-h-0 shadow-[inset_0_8px_8px_-10px_rgba(0,0,0,0.3)] pt-4"
          >
            {messages.value
              .filter((msgSig) => msgSig.value)
              .map(({ value: message }, i) => {
                const isUser = message.role === "user";
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
                        {Array.from(message.items.entries()).map(
                          ([key, item]) => (
                            <div key={key}>{renderItem(item)}</div>
                          ),
                        )}
                      </div>

                      {/* Provider error */}
                      {message.error && <ErrorMessage error={message.error} />}

                      {/* Text content */}
                      {message.text &&
                        (isUser ? (
                          <div>{message.text}</div>
                        ) : (
                          <MarkdownView
                            content={message.text}
                            class="whitespace-pre-wrap"
                          />
                        ))}

                      {/* Streaming indicator */}
                      {i === messages.value.length - 1 &&
                        streaming.value &&
                        !message.text &&
                        !message.error && (
                          <span class="loading loading-dots loading-sm"></span>
                        )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Input area */}
        <form
          class="grow flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input.value);
            input.value = "";
          }}
        >
          <input
            type="text"
            value={input.value}
            onInput={(e) => (input.value = e.currentTarget.value)}
            placeholder="Type a message..."
            class="input input-bordered rounded-field flex-1"
            disabled={streaming.value}
          />
          <button
            type="submit"
            class="btn btn-primary rounded-field"
            disabled={streaming.value || !input.value.trim()}
          >
            {streaming.value ? (
              <span class="loading loading-spinner loading-sm"></span>
            ) : (
              "Send"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
