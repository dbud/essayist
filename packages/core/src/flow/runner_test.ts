import { assert, assertEquals, assertRejects } from "@std/assert";
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

const emitted: unknown[] = [];
const emitRunners: NodeRunners<TestTypes> = {
  ...runners,
  produce: {
    // Captures emit's return value, so a leak shows up as a non-void value.
    execute(_, { emit }) {
      emitted.push(emit({ kind: "produced", content: "leaked" }));
      return Promise.resolve([]);
    },
  },
};

Deno.test("FlowRunner -- emit returns undefined, so callers cannot leak a value", async () => {
  const flow = new FlowRunner<TestTypes>({ runners: emitRunners });

  await flow.run({
    nodes: [
      { id: "s", kind: "source", dependsOn: [], payload: { text: "x" } },
      { id: "p", kind: "produce", dependsOn: ["s"], payload: { token: "t" } },
    ],
  });

  // A hook that validates its handler's return value rejects a number here.
  assertEquals(emitted, [undefined]);
});

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

Deno.test("FlowRunner -- delivers a custom event while the node still runs", async () => {
  // The node is still executing when the event arrives. Buffering to node end
  // delays delivery until after execute resolves, so this fails there.
  let deliveredDuringRun = false;
  let running = true;
  const slow: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      execute(_, { emit }) {
        emit({ kind: "produced", content: "early" });
        return new Promise((resolve) =>
          setTimeout(() => {
            running = false;
            resolve([]);
          }, 20),
        );
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: slow,
    onEvent: (event) => {
      if (event.type === "custom") deliveredDuringRun = running;
    },
  });

  await flow.run({
    nodes: [
      { id: "p", kind: "produce", dependsOn: [], payload: { token: "t" } },
    ],
  });

  assert(deliveredDuringRun);
});

Deno.test("FlowRunner -- keeps custom events in emission order", async () => {
  const seen: string[] = [];
  const chatty: NodeRunners<TestTypes> = {
    ...runners,
    produce: {
      async execute(_, { emit }) {
        for (const content of ["one", "two", "three"]) {
          emit({ kind: "produced", content });
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        return [];
      },
    },
  };
  const flow = new FlowRunner<TestTypes>({
    runners: chatty,
    onEvent: (event) => {
      if (event.type === "custom" && event.event.kind === "produced") {
        seen.push(event.event.content);
      }
    },
  });

  await flow.run({
    nodes: [
      { id: "p", kind: "produce", dependsOn: [], payload: { token: "t" } },
    ],
  });

  assertEquals(seen, ["one", "two", "three"]);
});

Deno.test("FlowRunner -- emits a failing node's events too", async () => {
  let delivered = false;
  let running = true;
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      boom: {
        execute(_, { emit }) {
          emit({ kind: "produced", content: "before the throw" });
          return Promise.reject(new Error("boom")).finally(() => {
            running = false;
          });
        },
      },
    },
    onEvent: (event) => {
      if (event.type === "custom") delivered = running;
    },
  });

  const result = await flow.run({
    nodes: [{ id: "b", kind: "boom", dependsOn: [], payload: undefined }],
  });

  assertEquals(result.status, "failed");
  assert(delivered);
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

Deno.test("FlowRunner -- records what a completed node committed on node_end", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  await flow.run({
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

Deno.test("FlowRunner -- a node that produces nothing records an empty artifact list", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners: {
      ...runners,
      sink: {
        execute() {
          return Promise.resolve([]);
        },
      },
    },
    onEvent: (event) => {
      events.push(event);
    },
  });

  await flow.run({
    nodes: [{ id: "s", kind: "sink", dependsOn: [], payload: undefined }],
  });

  const end = events.find((event) => event.type === "node_end");
  assertEquals(
    end?.run.status === "completed" ? end.run.artifacts : undefined,
    [],
  );
});

Deno.test("FlowRunner -- a failed node records no artifacts", async () => {
  const events: FlowEvent<TestTypes>[] = [];
  const flow = new FlowRunner<TestTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  await flow.run({
    nodes: [{ id: "b", kind: "boom", dependsOn: [], payload: undefined }],
  });

  const end = events.find((event) => event.type === "node_end");
  assertEquals(end?.run.status, "failed");
  assertEquals("artifacts" in (end?.run ?? {}), false);
});
