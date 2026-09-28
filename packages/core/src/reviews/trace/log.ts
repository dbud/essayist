import { logger } from "@/logger.ts";
import type { ReviewNodeEvent } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";

/** Mirrors agent_logger's pino event names for console parity. */
export function logTraceEvent(event: TraceEvent): void {
  switch (event.type) {
    case "node_end":
      if (event.run.status === "failed") {
        logger.debug(
          { node: event.nodeId, error: event.run.error },
          "node_end",
        );
      } else if (event.run.status === "skipped") {
        logger.debug(
          { node: event.nodeId, reason: event.run.reason },
          "node_end",
        );
      }
      break;
    case "custom":
      logCustom(event.nodeId, event.event);
      break;
    default:
      break;
  }
}

function logCustom(nodeId: string, event: ReviewNodeEvent): void {
  switch (event.type) {
    case "prompt":
      logger.debug({ node: nodeId, text: event.text }, "prompt");
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
    default:
      break;
  }
}
