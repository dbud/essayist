import { logger } from "@/logger.ts";
import type { ReviewNodeEvent } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";

/**
 * Log a trace event. Failures and model calls are logged at info, since a
 * prod run without a trace is the only record of them. Event content is
 * logged in full at debug.
 */
export function logTraceEvent(event: TraceEvent): void {
  switch (event.type) {
    case "node_start":
      logger.info({ node: event.nodeId }, "node_start");
      break;
    case "node_end":
      if (event.run.status === "failed") {
        logger.error(
          { node: event.nodeId, error: event.run.error },
          "node_end",
        );
      } else if (event.run.status === "skipped") {
        logger.info(
          { node: event.nodeId, reason: event.run.reason },
          "node_end",
        );
      } else {
        logger.info(
          {
            node: event.nodeId,
            durationMs: event.run.completedAt - event.run.startedAt,
          },
          "node_end",
        );
      }
      break;
    case "custom":
      logCustom(event.nodeId, event.event);
      break;
  }
}

function logCustom(nodeId: string, event: ReviewNodeEvent): void {
  switch (event.type) {
    case "model_call": {
      const { model, turnType, durationMs } = event.call;
      logger.info({ node: nodeId, model, turnType, durationMs }, "model_call");
      logger.debug({ node: nodeId, call: event.call }, "model_call");
      break;
    }
    case "prompt":
      logger.debug({ node: nodeId, text: event.text }, "prompt");
      break;
    case "reasoning":
      logger.debug({ node: nodeId, text: event.text }, "reasoning");
      break;
    case "repair":
      logger.info({ node: nodeId, error: event.error }, "repair");
      logger.debug({ node: nodeId, raw: event.raw }, "repair");
      break;
    case "output":
      logger.debug({ node: nodeId, output: event.output }, "output");
      break;
    case "applied":
      logger.debug(
        { node: nodeId, attempts: event.attempts.length },
        "applied",
      );
      break;
  }
}
