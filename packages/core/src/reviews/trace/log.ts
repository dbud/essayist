import { Effect } from "effect";
import type { ReviewNodeEvent } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";

/**
 * Log a trace event. Failures and model calls are logged at info, since a
 * prod run without a trace is the only record of them. Event content is
 * logged in full at debug.
 */
export function logTraceEvent(event: TraceEvent): Effect.Effect<void> {
  switch (event.type) {
    case "node_start":
      return Effect.logInfo("node_start", { node: event.nodeId });
    case "node_end":
      if (event.run.status === "failed") {
        return Effect.logError("node_end", {
          node: event.nodeId,
          error: event.run.error,
        });
      } else if (event.run.status === "skipped") {
        return Effect.logInfo("node_end", {
          node: event.nodeId,
          reason: event.run.reason,
        });
      } else {
        return Effect.logInfo("node_end", {
          node: event.nodeId,
          durationMs: event.run.completedAt - event.run.startedAt,
          artifacts: event.run.artifacts.length,
        });
      }
    case "custom":
      return logCustom(event.nodeId, event.event);
  }
}

function logCustom(
  nodeId: string,
  event: ReviewNodeEvent,
): Effect.Effect<void> {
  switch (event.type) {
    case "model_call": {
      const { model, turnType, durationMs } = event.call;
      return Effect.gen(function* () {
        yield* Effect.logInfo("model_call", {
          node: nodeId,
          model,
          turnType,
          durationMs,
        });
        yield* Effect.logDebug("model_call", {
          node: nodeId,
          call: event.call,
        });
      });
    }
    case "prompt":
      return Effect.logDebug("prompt", {
        node: nodeId,
        text: event.text,
      });
    case "reasoning":
      return Effect.logDebug("reasoning", {
        node: nodeId,
        text: event.text,
      });
    case "repair":
      return Effect.gen(function* () {
        yield* Effect.logInfo("repair", { node: nodeId, error: event.error });
        yield* Effect.logDebug("repair", { node: nodeId, raw: event.raw });
      });
    case "retry":
      return Effect.logInfo("retry", {
        node: nodeId,
        attempt: event.attempt,
        error: event.error,
      });
    case "output":
      return Effect.logDebug("output", {
        node: nodeId,
        output: event.output,
      });
    case "applied":
      return Effect.logDebug("applied", {
        node: nodeId,
        attempts: event.attempts.length,
      });
  }
}
