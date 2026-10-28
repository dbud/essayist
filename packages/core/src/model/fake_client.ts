/**
 * A fake OpenRouterClient for model client tests: canned rounds replay in
 * order, capturing the prompt of every request.
 */

import type { Generated } from "@effect/ai-openrouter";
import type { Service } from "@effect/ai-openrouter/OpenRouterClient";
import { Effect } from "effect";
import { AiError, AuthenticationError, NetworkError } from "effect/ai/AiError";
import type { HttpClientResponse } from "effect/http/HttpClientResponse";

export interface FakeRound {
  text: string;
  reasoning?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    cost?: number;
  };
  failWith?: AiError;
}

type ChatRequest = typeof Generated.ChatRequest.Encoded;
type ChatResult = typeof Generated.SendChatCompletionRequest200.Type;

function aiError(reason: AiError["reason"]): AiError {
  return new AiError({
    module: "fake_client",
    method: "createChatCompletion",
    reason,
  });
}

/** A transport-level provider error, the way dropped connections fail. */
export function networkAiError(description: string): AiError {
  return aiError(
    new NetworkError({
      reason: "TransportError",
      request: {
        method: "POST",
        url: "https://openrouter.test/api/v1/chat/completions",
        urlParams: [],
        headers: {},
      },
      description,
    }),
  );
}

/** A credential fault, which no retry would clear. */
export function authAiError(description: string): AiError {
  return aiError(new AuthenticationError({ kind: "InvalidKey", description }));
}

function usageBody(usage: FakeRound["usage"]): ChatResult["usage"] {
  if (usage === undefined) return undefined;
  const promptDetails: NonNullable<ChatResult["usage"]>["prompt_tokens_details"] | undefined =
    usage.cachedTokens === undefined ? undefined : { cached_tokens: usage.cachedTokens };
  const completionDetails:
    | NonNullable<ChatResult["usage"]>["completion_tokens_details"]
    | undefined =
    usage.reasoningTokens === undefined ? undefined : { reasoning_tokens: usage.reasoningTokens };
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens,
    ...(promptDetails !== undefined ? { prompt_tokens_details: promptDetails } : {}),
    ...(completionDetails !== undefined ? { completion_tokens_details: completionDetails } : {}),
    ...(usage.cost !== undefined ? { cost: usage.cost } : {}),
  };
}

function chatResult(round: FakeRound): ChatResult {
  return {
    id: "resp_1",
    model: round.model ?? "m/a",
    created: 1,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: round.text,
          ...(round.reasoning !== undefined ? { reasoning: round.reasoning } : {}),
        },
        finish_reason: "stop",
      },
    ],
    system_fingerprint: null,
    usage: usageBody(round.usage),
  };
}

export function createFakeClient(rounds: FakeRound[]): {
  client: Service;
  inputs: string[];
} {
  const inputs: string[] = [];
  const client = {
    createChatCompletion: (request: ChatRequest) => {
      const last = request.messages[request.messages.length - 1];
      inputs.push(typeof last?.content === "string" ? last.content : "");
      const round = rounds[Math.min(inputs.length - 1, rounds.length - 1)];
      if (round.failWith !== undefined) return Effect.fail(round.failWith);
      const body = chatResult(round);
      return Effect.succeed([body, null as unknown as HttpClientResponse]);
    },
  } as unknown as Service;
  return { client, inputs };
}
