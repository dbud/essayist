/**
 * The progress of a review shown to the user: the state of each unit and the count of placed marks.
 * Built from trace events, leaving out prompts, model output, and reasoning. Status and timestamps
 * stay on the run.
 */

import { Schema } from "effect";

import type { NodeRun } from "#/flow/types.ts";

import type { TraceEvent } from "./trace/types.ts";

/** Maps each unit id to its graph node ids, in unit order. A unit ends with its last node. */
export type ReviewPlan = ReadonlyMap<string, readonly string[]>;

// Node run statuses, plus the two states of a unit that hasn't ended.
const UNIT_STATES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const satisfies readonly ("pending" | "running" | NodeRun["status"])[];

const UnitState = Schema.Literals(UNIT_STATES);
type UnitState = Schema.Schema.Type<typeof UnitState>;

export const ReviewProgress = Schema.Struct({
  units: Schema.Array(Schema.Struct({ id: Schema.String, state: UnitState })),
  marksPlaced: Schema.Int,
});
export type ReviewProgress = Schema.Schema.Type<typeof ReviewProgress>;

export function initialProgress(plan: ReviewPlan): ReviewProgress {
  return {
    units: plan
      .keys()
      .map((id) => ({ id, state: "pending" as const }))
      .toArray(),
    marksPlaced: 0,
  };
}

/**
 * Returns the same object when the event doesn't change the progress, so callers can skip sending
 * an update. Any failed node fails its unit; the last node completing or being skipped ends the
 * unit with that status. A unit that has ended keeps its state.
 */
export function applyTraceEvent(
  plan: ReviewPlan,
  progress: ReviewProgress,
  event: TraceEvent,
): ReviewProgress {
  if (event.type === "custom") {
    if (event.event.type !== "applied") return progress;
    const placed = event.event.attempts.filter((attempt) => attempt.marked).length;
    if (placed === 0) return progress;
    return { ...progress, marksPlaced: progress.marksPlaced + placed };
  }

  const index = progress.units.findIndex((unit) => plan.get(unit.id)?.includes(event.nodeId));
  if (index === -1) return progress;
  const { id, state } = progress.units[index];
  if (state !== "pending" && state !== "running") return progress;

  const next = nextState(state, event, plan.get(id)?.at(-1));
  if (next === state) return progress;
  const units = progress.units.map((unit, i) => (i === index ? { id, state: next } : unit));
  return { ...progress, units };
}

/** Counts the units that have ended: completed, failed, or skipped. */
export function unitsEnded(progress: ReviewProgress): number {
  return progress.units.filter((unit) => unit.state !== "pending" && unit.state !== "running")
    .length;
}

function nextState(
  state: UnitState,
  event: Extract<TraceEvent, { type: "node_start" | "node_end" }>,
  lastNodeId: string | undefined,
): UnitState {
  if (event.type === "node_start") return "running";
  const { status } = event.run;
  if (status === "failed") return "failed";
  if (event.nodeId === lastNodeId) return status;
  return status === "completed" ? "running" : state;
}

/** The progress of a run with the seq of the last trace event it includes. */
export interface ProgressFeed {
  readonly plan: ReviewPlan;
  readonly progress: ReviewProgress;
  readonly seq: number;
}

export function progressFeed(plan: ReviewPlan, trace: readonly TraceEvent[]): ProgressFeed {
  const progress = trace.reduce(
    (current, event) => applyTraceEvent(plan, current, event),
    initialProgress(plan),
  );
  return { plan, progress, seq: trace.at(-1)?.seq ?? -1 };
}

/**
 * Skips an event the feed already includes, so a live event that was also in the stored trace
 * counts once. `progress` stays the same object when the event doesn't change it.
 */
export function feedTraceEvent(feed: ProgressFeed, event: TraceEvent): ProgressFeed {
  if (event.seq <= feed.seq) return feed;
  return {
    ...feed,
    progress: applyTraceEvent(feed.plan, feed.progress, event),
    seq: event.seq,
  };
}
