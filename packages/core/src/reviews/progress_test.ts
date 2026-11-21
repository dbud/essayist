import { assertEquals, assertStrictEquals } from "@std/assert";
import { test } from "vitest";

import type { ResolvedReviewPass, ResolvedReviewUnit } from "#/config/types.ts";

import { reviewPlan } from "./adapter.ts";
import {
  applyTraceEvent,
  feedTraceEvent,
  initialProgress,
  progressFeed,
  type ReviewProgress,
  unitsEnded,
} from "./progress.ts";
import type { TraceEvent } from "./trace/types.ts";

function unit(partial: Partial<ResolvedReviewUnit> & Pick<ResolvedReviewUnit, "id">) {
  return {
    prompts: { system: "", directive: "", instructions: "", categories: "" },
    pool: { id: "pool", name: "Pool", models: ["m/a"] },
    inputs: [],
    ...partial,
  };
}

const pass: ResolvedReviewPass = {
  pass: { id: "pass", name: "Pass", systemPromptKey: "sys", modelPoolId: "pool", units: [] },
  units: [
    unit({
      id: "mechanics",
      attempt: { categories: [{ id: "grammar", label: "grammar" }], repairRounds: 1 },
    }),
    unit({ id: "summary", inputs: ["mechanics"], summary: true }),
  ],
};

const plan = reviewPlan(pass);

let seq = 0;
const at = { seq: 0, at: 0 };
const start = (nodeId: string): TraceEvent => ({ ...at, seq: seq++, type: "node_start", nodeId });
const completed = (nodeId: string): TraceEvent => ({
  ...at,
  seq: seq++,
  type: "node_end",
  nodeId,
  run: { nodeId, status: "completed", startedAt: 0, completedAt: 0, artifacts: [] },
});
const failed = (nodeId: string): TraceEvent => ({
  ...at,
  seq: seq++,
  type: "node_end",
  nodeId,
  run: { nodeId, status: "failed", startedAt: 0, completedAt: 0, error: "boom" },
});
const skipped = (nodeId: string): TraceEvent => ({
  ...at,
  seq: seq++,
  type: "node_end",
  nodeId,
  run: { nodeId, status: "skipped", reason: "upstream failure" },
});
const applied = (nodeId: string, marked: number, unmarked = 0): TraceEvent => ({
  ...at,
  seq: seq++,
  type: "custom",
  nodeId,
  event: {
    type: "applied",
    attempts: [
      ...Array.from({ length: marked }, () => ({ selected_text: "a", comment: "c", marked: true })),
      ...Array.from({ length: unmarked }, () => ({
        selected_text: "b",
        comment: "c",
        marked: false,
      })),
    ],
  },
});

const fold = (events: TraceEvent[], from: ReviewProgress = initialProgress(plan)) =>
  events.reduce((progress, event) => applyTraceEvent(plan, progress, event), from);

const states = (progress: ReviewProgress) => progress.units.map((u) => u.state);

test("reviewPlan -- maps each unit to its nodes, the last one finishing the unit", () => {
  assertEquals(
    plan,
    new Map([
      [
        "mechanics",
        [
          "mechanics.propose",
          "mechanics.apply",
          "mechanics.repair1.gate",
          "mechanics.repair1.propose",
          "mechanics.repair1.apply",
          "mechanics.collect",
        ],
      ],
      ["summary", ["summary"]],
    ]),
  );
});

test("progress -- starts with every unit pending", () => {
  assertEquals(initialProgress(plan), {
    units: [
      { id: "mechanics", state: "pending" },
      { id: "summary", state: "pending" },
    ],
    marksPlaced: 0,
  });
});

test("progress -- a unit runs until its last node completes", () => {
  const midway = fold([start("mechanics.propose"), completed("mechanics.propose")]);
  assertEquals(states(midway), ["running", "pending"]);

  const done = fold([start("mechanics.collect"), completed("mechanics.collect")], midway);
  assertEquals(states(done), ["completed", "pending"]);
});

test("unitsEnded -- counts completed, failed, and skipped units", () => {
  const progress: ReviewProgress = {
    units: [
      { id: "a", state: "completed" },
      { id: "b", state: "failed" },
      { id: "c", state: "skipped" },
      { id: "d", state: "running" },
      { id: "e", state: "pending" },
    ],
    marksPlaced: 0,
  };
  assertEquals(unitsEnded(progress), 3);
});

test("progress -- counts placed marks across apply and repair rounds", () => {
  const progress = fold([applied("mechanics.apply", 2, 1), applied("mechanics.repair1.apply", 1)]);
  assertEquals(progress.marksPlaced, 3);
});

test("progress -- a failure fails the unit, and a skipped last node skips the next", () => {
  const progress = fold([
    start("mechanics.propose"),
    failed("mechanics.propose"),
    skipped("mechanics.collect"),
    skipped("summary"),
  ]);
  assertEquals(states(progress), ["failed", "skipped"]);
});

test("progress -- events a reader does not see return the same object", () => {
  const before = fold([start("mechanics.propose")]);
  assertStrictEquals(applyTraceEvent(plan, before, start("content")), before);
  assertStrictEquals(applyTraceEvent(plan, before, start("mechanics.apply")), before);
  assertStrictEquals(applyTraceEvent(plan, before, applied("mechanics.apply", 0, 2)), before);
  assertStrictEquals(
    applyTraceEvent(plan, before, {
      ...at,
      seq: seq++,
      type: "custom",
      nodeId: "mechanics.propose",
      event: { type: "reasoning", text: "thinking" },
    }),
    before,
  );
});

test("progressFeed -- folds a stored trace", () => {
  const { progress } = progressFeed(plan, [
    start("mechanics.collect"),
    applied("mechanics.apply", 2),
    completed("mechanics.collect"),
    start("summary"),
  ]);
  assertEquals(states(progress), ["completed", "running"]);
  assertEquals(progress.marksPlaced, 2);
});

test("progressFeed -- remembers the seq of the last stored event", () => {
  const first = start("mechanics.propose");
  const second = applied("mechanics.apply", 1);
  const feed = progressFeed(plan, [first, second]);
  assertEquals(feed.seq, second.seq);
  assertEquals(feed.progress.marksPlaced, 1);
  assertEquals(progressFeed(plan, []).seq, -1);
});

test("feedTraceEvent -- an event the feed already includes counts once", () => {
  const event = applied("mechanics.apply", 2);
  const feed = progressFeed(plan, [event]);
  assertStrictEquals(feedTraceEvent(feed, event), feed);
  assertEquals(feedTraceEvent(feed, event).progress.marksPlaced, 2);
});

test("feedTraceEvent -- advances the seq, keeping progress when nothing a user sees changed", () => {
  const feed = progressFeed(plan, [start("mechanics.propose")]);

  const quiet = start("mechanics.apply");
  const afterQuiet = feedTraceEvent(feed, quiet);
  assertEquals(afterQuiet.seq, quiet.seq);
  assertStrictEquals(afterQuiet.progress, feed.progress);

  const placed = applied("mechanics.apply", 1);
  const afterPlaced = feedTraceEvent(afterQuiet, placed);
  assertEquals(afterPlaced.seq, placed.seq);
  assertEquals(afterPlaced.progress.marksPlaced, 1);
});
