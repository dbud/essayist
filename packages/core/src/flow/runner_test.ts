import { assert, assertEquals, assertRejects } from "@std/assert";
import { Effect } from "effect";
import { test } from "vitest";
import type { FlowRunOptions } from "./runner.ts";
import { FlowRunner } from "./runner.ts";
import type {
  FlowEvent,
  FlowGraph,
  FlowRunResult,
  FlowTypes,
  NodeRunners,
  SkippedNodeRun,
} from "./types.ts";

interface TestTypes extends FlowTypes {
  nodes: {
    source: { text: string };
    produce: { token: string };
    boom: undefined;
    sink: undefined;
  };
  artifacts: {
    content: string;
    token: string;
  };
  events: { kind: "produced"; content: string };
}

const runners: NodeRunners<TestTypes> = {
  source: {
    execute({ text }, { artifact }) {
      return Effect.succeed([artifact("content", text)]);
    },
  },
  produce: {
    execute({ token }, { inputs, artifact, emit }) {
      return Effect.gen(function* () {
        const content = inputs.one("content");
        yield* emit({ kind: "produced", content });
        return [artifact("token", token)];
      });
    },
  },
  boom: {
    execute() {
      return Effect.fail(new Error("boom"));
    },
  },
  sink: {
    execute(_, { inputs, artifact }) {
      return Effect.sync(() => {
        const tokens = inputs.of("token");
        return [artifact("content", tokens.join(","))];
      });
    },
  },
};

const emitted: unknown[] = [];
const emitRunners: NodeRunners<TestTypes> = {
  ...runners,
  produce: {
    // Captures emit's awaited value, so a leak shows up as a non-void value.
    execute(_, { emit }) {
      return Effect.gen(function* () {
        emitted.push(yield* emit({ kind: "produced", content: "leaked" }));
        return [];
      });
    },
  },
};

const run = (
  flow: FlowRunner<TestTypes>,
  graph: FlowGraph<TestTypes>,
  options?: FlowRunOptions<TestTypes>,
): Promise<FlowRunResult<TestTypes>> =>
  Effect.runPromise(flow.run(graph, options));

test("FlowRunner -- emit returns undefined, so callers cannot leak a value", async () => {
  const flow = new FlowRunner<TestTypes>({ runners: emitRunners });

  await run(flow, {
    nodes: [
      { id: "s", kind: "source", dependsOn: [], payload: { text: "x" } },
      { id: "p", kind: "produce", dependsOn: ["s"], payload: { token: "t" } },
    ],
  });

  // A hook that validates its handler's return value rejects a number here.
  assertEquals(emitted, [undefined]);
});

test("FlowRunner -- commits artifacts along a chain", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "b", kind: "produce", dependsOn: ["a"], payload: { token: "tok" } },
    ],
  });

  assertEquals(result.status, "completed");
  assertEquals(
    result.nodeRuns.map((run) => run.nodeId),
    ["a", "b"],
  );
  assertEquals(result.artifacts, [
    { type: "content", data: "alpha", producedBy: "a" },
    { type: "token", data: "tok", producedBy: "b" },
  ]);
  assertEquals(
    events.map((event) => [event.type, event.nodeId]),
    [
      ["node_start", "a"],
      ["node_end", "a"],
      ["node_start", "b"],
      ["custom", "b"],
      ["node_end", "b"],
    ],
  );
});

test("FlowRunner -- unions same-type artifacts in dependsOn order", async () => {
  let seen: string[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      sink: {
        execute(_, { inputs }) {
          return Effect.sync(() => {
            seen = inputs.of("token");
            return [];
          });
        },
      },
    },
  });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      {
        id: "p1",
        kind: "produce",
        dependsOn: ["a"],
        payload: { token: "one" },
      },
      {
        id: "p2",
        kind: "produce",
        dependsOn: ["a"],
        payload: { token: "two" },
      },
      { id: "s", kind: "sink", dependsOn: ["p1", "p2"] },
    ],
  });

  assertEquals(result.status, "completed");
  assertEquals(seen, ["one", "two"]);
});

test("FlowRunner -- delivers a custom event while the node still runs", async () => {
  // The node is still executing when the event arrives. Buffering to node end
  // delays delivery until after execute resolves, so this fails there.
  let deliveredDuringRun = false;
  let running = true;
  const slow: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute(_, { emit }) {
        return Effect.gen(function* () {
          yield* emit({ kind: "produced", content: "early" });
          yield* Effect.sleep(20);
          running = false;
          return [];
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: slow,
    onEvent: (event) =>
      Effect.sync(() => {
        if (event.type === "custom") deliveredDuringRun = running;
      }),
  });

  await run(flow, {
    nodes: [
      { id: "p", kind: "produce", dependsOn: [], payload: { token: "t" } },
    ],
  });

  assert(deliveredDuringRun);
});

test("FlowRunner -- keeps custom events in emission order", async () => {
  const seen: string[] = [];
  const chatty: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute(_, { emit }) {
        return Effect.gen(function* () {
          for (const content of ["one", "two", "three"]) {
            yield* emit({ kind: "produced", content });
            yield* Effect.sleep(1);
          }
          return [];
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: chatty,
    onEvent: (event) =>
      Effect.sync(() => {
        if (event.type === "custom" && event.event.kind === "produced") {
          seen.push(event.event.content);
        }
      }),
  });

  await run(flow, {
    nodes: [
      { id: "p", kind: "produce", dependsOn: [], payload: { token: "t" } },
    ],
  });

  assertEquals(seen, ["one", "two", "three"]);
});

test("FlowRunner -- emits a failing node's events too", async () => {
  let delivered = false;
  let running = true;
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      boom: {
        execute(_, { emit }) {
          return Effect.gen(function* () {
            yield* emit({ kind: "produced", content: "before the throw" });
            running = false;
            return yield* Effect.fail(new Error("boom"));
          });
        },
      },
    },
    onEvent: (event) =>
      Effect.sync(() => {
        if (event.type === "custom") delivered = running;
      }),
  });

  const result = await run(flow, {
    nodes: [{ id: "b", kind: "boom", dependsOn: [], payload: undefined }],
  });

  assertEquals(result.status, "failed");
  assert(delivered);
});

test("FlowRunner -- a listener defect is dropped, not failed into the run", async () => {
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: () => Effect.die(new Error("listener fault")),
  });

  const result = await run(flow, {
    nodes: [{ id: "a", kind: "source", dependsOn: [], payload: { text: "x" } }],
  });

  assertEquals(result.status, "completed");
});

test("FlowRunner -- rejects broken graphs before running", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  await assertRejects(
    () =>
      run(flow, {
        nodes: [
          { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
          { id: "a", kind: "produce", dependsOn: [], payload: { token: "t" } },
        ],
      }),
    Error,
    'duplicate node id "a"',
  );

  await assertRejects(
    () =>
      run(flow, {
        nodes: [
          { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
          {
            id: "b",
            kind: "produce",
            dependsOn: ["ghost"],
            payload: { token: "t" },
          },
        ],
      }),
    Error,
    'unknown node "ghost"',
  );

  await assertRejects(
    () =>
      run(flow, {
        nodes: [
          {
            id: "a",
            kind: "produce",
            dependsOn: ["b"],
            payload: { token: "t" },
          },
          {
            id: "b",
            kind: "produce",
            dependsOn: ["a"],
            payload: { token: "t" },
          },
        ],
      }),
    Error,
    "cycle",
  );
});

test("FlowRunner -- skips nodes downstream of a failure", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "b", kind: "boom", dependsOn: ["a"] },
      { id: "c", kind: "produce", dependsOn: ["b"], payload: { token: "t" } },
      {
        id: "d",
        kind: "produce",
        dependsOn: ["a"],
        payload: { token: "side" },
      },
      // One failed and one completed dep: e never runs.
      {
        id: "e",
        kind: "produce",
        dependsOn: ["b", "d"],
        payload: { token: "t" },
      },
    ],
  });

  assertEquals(result.status, "failed");
  assertEquals(result.errors, ["boom"]);
  assertEquals(result.artifacts, [
    { type: "content", data: "alpha", producedBy: "a" },
    { type: "token", data: "side", producedBy: "d" },
  ]);
  assertEquals(
    result.nodeRuns.map((run) => [run.nodeId, run.status]),
    [
      ["a", "completed"],
      ["b", "failed"],
      ["c", "skipped"],
      ["d", "completed"],
      ["e", "skipped"],
    ],
  );
  const skipped = result.nodeRuns.find(
    (run): run is SkippedNodeRun => run.status === "skipped",
  );
  assertEquals(skipped?.nodeId, "c");
  assertEquals(skipped?.reason, 'dependency "b" failed: boom');
});

test("FlowRunner -- keeps independent branches running after a failure", async () => {
  const delayed: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute({ token }, { artifact }) {
        return Effect.gen(function* () {
          yield* Effect.sleep(5);
          return [artifact("token", token)];
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({ runners: delayed });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "b", kind: "boom", dependsOn: ["a"] },
      { id: "p", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
      { id: "d", kind: "produce", dependsOn: ["p"], payload: { token: "t2" } },
    ],
  });

  // The failure lands while p is still in flight; d runs anyway and commits.
  assertEquals(result.status, "failed");
  assertEquals(result.errors, ["boom"]);
  assertEquals(
    result.nodeRuns.map((run) => [run.nodeId, run.status]),
    [
      ["a", "completed"],
      ["b", "failed"],
      ["p", "completed"],
      ["d", "completed"],
    ],
  );
});

test("FlowRunner -- accumulates failures from concurrent nodes", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "b", kind: "boom", dependsOn: ["a"] },
      { id: "c", kind: "boom", dependsOn: ["a"] },
    ],
  });

  assertEquals(result.status, "failed");
  assertEquals(result.errors, ["boom", "boom"]);
});

test("FlowRunner -- respects maxConcurrency", async () => {
  let active = 0;
  let peak = 0;
  const capped: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute({ token }, { artifact }) {
        active += 1;
        peak = Math.max(peak, active);
        return Effect.gen(function* () {
          yield* Effect.sleep(5);
          active -= 1;
          return [artifact("token", token)];
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: capped,
    maxConcurrency: 1,
  });

  const result = await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "p1", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
      { id: "p2", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
      { id: "p3", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
    ],
  });

  assertEquals(result.status, "completed");
  assertEquals(peak, 1);
});

test("FlowRunner -- a resumed node does not re-run and seeds its artifacts", async () => {
  let ran = false;
  const counting: NodeRunners<TestTypes> = {
    ...runners,
    source: {
      execute(_, { artifact }) {
        ran = true;
        return Effect.succeed([artifact("content", "fresh")]);
      },
    },
  };
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: counting,
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  const result = await run(
    flow,
    {
      nodes: [
        { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
      ],
    },
    {
      completed: new Map([
        ["a", [{ type: "content", data: "earlier", producedBy: "a" }]],
      ]),
    },
  );

  assertEquals(ran, false);
  assertEquals(result.status, "completed");
  assertEquals(result.artifacts, [
    { type: "content", data: "earlier", producedBy: "a" },
  ]);
  assertEquals(events, []);
  assertEquals(result.nodeRuns, []);
});

test("FlowRunner -- a resumed node feeds its dependents", async () => {
  let seen: string[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      sink: {
        execute(_, { inputs, artifact }) {
          return Effect.sync(() => {
            seen = inputs.of("token");
            return [artifact("content", "done")];
          });
        },
      },
    },
  });

  const result = await run(
    flow,
    {
      nodes: [
        { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
        { id: "p", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
        { id: "s", kind: "sink", dependsOn: ["p"] },
      ],
    },
    {
      completed: new Map([
        ["a", [{ type: "content", data: "earlier", producedBy: "a" }]],
      ]),
    },
  );

  assertEquals(result.status, "completed");
  assertEquals(seen, ["t"]);
  assertEquals(
    result.nodeRuns.map((run) => [run.nodeId, run.status]),
    [
      ["p", "completed"],
      ["s", "completed"],
    ],
  );
});

test("FlowRunner -- a resumed node is not reported as skipped", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await run(
    flow,
    {
      nodes: [
        { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
        { id: "p", kind: "produce", dependsOn: ["a"], payload: { token: "t" } },
      ],
    },
    {
      completed: new Map([
        ["a", [{ type: "content", data: "earlier", producedBy: "a" }]],
      ]),
    },
  );

  assertEquals(
    result.nodeRuns.some((run) => run.nodeId === "a"),
    false,
  );
  assertEquals(result.errors, []);
});

test("FlowRunner -- ignores a completed entry the graph no longer has", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await run(
    flow,
    {
      nodes: [
        { id: "a", kind: "source", dependsOn: [], payload: { text: "x" } },
      ],
    },
    {
      completed: new Map([
        [
          "retired",
          [{ type: "content", data: "stale", producedBy: "retired" }],
        ],
      ]),
    },
  );

  assertEquals(result.status, "completed");
  assertEquals(
    result.nodeRuns.map((run) => run.nodeId),
    ["a"],
  );
  // The retired node's artifact must not reach the result either.
  assertEquals(result.artifacts, [
    { type: "content", data: "x", producedBy: "a" },
  ]);
});

test("FlowRunner -- completes an empty graph", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });
  const result = await run(flow, { nodes: [] });

  assertEquals(result.status, "completed");
  assertEquals(result.nodeRuns, []);
  assertEquals(result.artifacts, []);
});

test("FlowRunner -- records what a completed node committed on node_end", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  await run(flow, {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
    ],
  });

  const end = events.find((event) => event.type === "node_end");
  assertEquals(end?.run.status, "completed");
  assertEquals(
    end?.run.status === "completed" ? end.run.artifacts : undefined,
    [{ type: "content", data: "alpha", producedBy: "a" }],
  );
});

test("FlowRunner -- a node that produces nothing records an empty artifact list", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      sink: {
        execute() {
          return Effect.succeed([]);
        },
      },
    },
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  await run(flow, {
    nodes: [{ id: "s", kind: "sink", dependsOn: [], payload: undefined }],
  });

  const end = events.find((event) => event.type === "node_end");
  assertEquals(
    end?.run.status === "completed" ? end.run.artifacts : undefined,
    [],
  );
});

test("FlowRunner -- a failed node records no artifacts", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  await run(flow, {
    nodes: [{ id: "b", kind: "boom", dependsOn: [], payload: undefined }],
  });

  const end = events.find((event) => event.type === "node_end");
  assertEquals(end?.run.status, "failed");
  assertEquals("artifacts" in (end?.run ?? {}), false);
});
