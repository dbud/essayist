import { assertEquals } from "@std/assert";
import type { ForwardSpec, PassWhenSpec } from "./helpers.ts";
import { forward, passWhen } from "./helpers.ts";
import { FlowRunner } from "./runner.ts";
import type { FlowGraph, FlowTypes, NodeRunner, NodeRunners } from "./types.ts";

interface HelperTypes extends FlowTypes {
  nodes: {
    source: { text: string };
    relay: ForwardSpec<HelperTypes>;
    gate: PassWhenSpec<HelperTypes>;
  };
  artifacts: {
    text: string;
    token: string;
  };
}

const source: NodeRunner<HelperTypes, "source"> = {
  execute({ text }, { artifact }) {
    return Promise.resolve([
      artifact("text", text),
      artifact("token", text.toUpperCase()),
    ]);
  },
};

const runners: NodeRunners<HelperTypes> = {
  source,
  relay: forward<HelperTypes, "relay">(),
  gate: passWhen<HelperTypes, "gate">(),
};

Deno.test("forward -- re-emits selected types, keeping the producer", async () => {
  const flow = new FlowRunner<HelperTypes>({ runners });

  const graph: FlowGraph<HelperTypes> = {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "hi" } },
      {
        id: "r",
        kind: "relay",
        dependsOn: ["a"],
        payload: { types: ["text"] },
      },
    ],
  };

  const result = await flow.run(graph);

  assertEquals(result.status, "completed");
  assertEquals(result.artifacts, [
    { type: "text", data: "hi", producedBy: "a" },
    { type: "token", data: "HI", producedBy: "a" },
    { type: "text", data: "hi", producedBy: "a" },
  ]);
});

Deno.test("passWhen -- forwards while the predicate holds", async () => {
  const flow = new FlowRunner<HelperTypes>({ runners });

  const graph: FlowGraph<HelperTypes> = {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "hi" } },
      {
        id: "g",
        kind: "gate",
        dependsOn: ["a"],
        payload: {
          when: (inputs) => inputs.of("text").length > 0,
          types: ["text"],
        },
      },
    ],
  };

  const result = await flow.run(graph);

  assertEquals(result.status, "completed");
  assertEquals(result.artifacts, [
    { type: "text", data: "hi", producedBy: "a" },
    { type: "token", data: "HI", producedBy: "a" },
    { type: "text", data: "hi", producedBy: "a" },
  ]);
});

Deno.test("passWhen -- completes empty when the predicate fails", async () => {
  const flow = new FlowRunner<HelperTypes>({ runners });

  const graph: FlowGraph<HelperTypes> = {
    nodes: [
      { id: "a", kind: "source", dependsOn: [], payload: { text: "hi" } },
      {
        id: "g",
        kind: "gate",
        dependsOn: ["a"],
        payload: {
          when: () => false,
          types: ["text"],
        },
      },
    ],
  };

  const result = await flow.run(graph);

  assertEquals(result.status, "completed");
  // Only the source commit: the gate node completed with nothing.
  assertEquals(result.artifacts, [
    { type: "text", data: "hi", producedBy: "a" },
    { type: "token", data: "HI", producedBy: "a" },
  ]);
});
