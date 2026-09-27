import { assertEquals, assertRejects } from "@std/assert";
import { FlowRunner } from "./runner.ts";
import type {
  FlowEvent,
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
      return Promise.resolve([artifact("content", text)]);
    },
  },
  produce: {
    execute({ token }, { inputs, artifact, emit }) {
      const content = inputs.one("content");
      emit({ kind: "produced", content });
      return Promise.resolve([artifact("token", token)]);
    },
  },
  boom: {
    execute() {
      return Promise.reject(new Error("boom"));
    },
  },
  sink: {
    execute(_, { inputs, artifact }) {
      const tokens = inputs.of("token");
      return Promise.resolve([artifact("content", tokens.join(","))]);
    },
  },
};

Deno.test("FlowRunner -- commits artifacts along a chain", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  const result = await flow.run({
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

Deno.test("FlowRunner -- unions same-type artifacts in dependsOn order", async () => {
  let seen: string[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      sink: {
        execute(_, { inputs }) {
          seen = inputs.of("token");
          return Promise.resolve([]);
        },
      },
    },
  });

  const result = await flow.run({
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

Deno.test("FlowRunner -- rejects broken graphs before running", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  await assertRejects(
    () =>
      flow.run({
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
      flow.run({
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
      flow.run({
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

Deno.test("FlowRunner -- skips nodes downstream of a failure", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await flow.run({
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

Deno.test("FlowRunner -- keeps independent branches running after a failure", async () => {
  const delayed: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute({ token }, { artifact }) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve([artifact("token", token)]);
          }, 5);
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({ runners: delayed });

  const result = await flow.run({
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

Deno.test("FlowRunner -- accumulates failures from concurrent nodes", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });

  const result = await flow.run({
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "alpha" } },
      { id: "b", kind: "boom", dependsOn: ["a"] },
      { id: "c", kind: "boom", dependsOn: ["a"] },
    ],
  });

  assertEquals(result.status, "failed");
  assertEquals(result.errors, ["boom", "boom"]);
});

Deno.test("FlowRunner -- respects maxConcurrency", async () => {
  let active = 0;
  let peak = 0;
  const capped: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute({ token }, { artifact }) {
        active += 1;
        peak = Math.max(peak, active);
        return new Promise((resolve) => {
          setTimeout(() => {
            active -= 1;
            resolve([artifact("token", token)]);
          }, 5);
        });
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: capped,
    maxConcurrency: 1,
  });

  const result = await flow.run({
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

Deno.test("FlowRunner -- completes an empty graph", async () => {
  const flow = new FlowRunner<TestTypes>({ runners });
  const result = await flow.run({ nodes: [] });

  assertEquals(result.status, "completed");
  assertEquals(result.nodeRuns, []);
  assertEquals(result.artifacts, []);
});
