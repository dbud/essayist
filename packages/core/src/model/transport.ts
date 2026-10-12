/**
 * The model transport contract: the SDK-shaped client the ModelClient
 * service wraps, and the structured-call plumbing shared with the review
 * steps. Tests spy on the transport; the composition root passes
 * OpenRouter.
 */

import type {
  CallModelInput,
  ModelResult,
  PostModelCallPayload,
  RequestOptions,
  SessionUsageTotals,
  Tool,
} from "@openrouter/agent";

export type { PostModelCallPayload, SessionUsageTotals };

// The OpenRouter SDK retries only 5XX by default (retryCodes: ["5XX"]). Free
// upstream providers commonly 429, so opt 429 into the same backoff loop.
// The SDK honors any Retry-After header from OpenRouter, overriding the
// computed interval.
export const RETRY_OPTIONS: RequestOptions = {
  timeoutMs: 5 * 60_000,
  retryCodes: ["429", "5XX"],
  retries: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1000,
      maxInterval: 30_000,
      exponent: 2,
      maxElapsedTime: 120_000,
    },
    retryConnectionErrors: true,
  },
};

export class StructuredParseError extends Error {
  constructor(
    public readonly raw: string,
    message: string,
  ) {
    super(message);
  }
}

/** A re-ask: what the model replied, and why it did not fit the schema. */
export interface RepairAttempt {
  /** The reply that was rejected. */
  raw: string;
  /** The validation error, as the model was told it. */
  error: string;
}

/** A failed attempt at a round, and the attempt it was. */
export interface RetryFailure {
  /** Which attempt failed, counting the first. */
  attempt: number;
  error: string;
}

/** Callbacks for watching a structured call as it runs. */
export interface StructuredCallOptions {
  includeExample?: boolean;
  onPrompt?: (text: string) => void;
  onModelCall?: (call: PostModelCallPayload) => void;
  onRepair?: (repair: RepairAttempt) => void;
  onRetry?: (failure: RetryFailure) => void;
}

export interface StructuredCall<T> {
  output: T;
  usage: SessionUsageTotals;
  /** Each call's reasoning, in call order. Empty when none did. */
  reasoning: string[];
  /** Every model call made, in order, including a re-ask. */
  calls: PostModelCallPayload[];
  /** Why each re-ask happened. Empty when the first reply parsed. */
  repairs: RepairAttempt[];
}

export const ROUND_RETRY_DELAY_MS = 1_000;

export interface ModelClient {
  callModel(
    request: CallModelInput,
    options?: RequestOptions,
  ): ModelResult<readonly Tool[]>;
}
