// Temporary walkthrough of flow construction and consumption with stub
// runners; no review logic lives here. TODO--assert and TODO--capture
// markers show where real expectations and calls belong. Delete this
// file when the review adapter supersedes it.

import { partition } from "@std/collections";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import { passWhen } from "@/flow/helpers.ts";
import { FlowRunner } from "@/flow/runner.ts";
import type {
  FlowEvent,
  FlowGraph,
  FlowNodeOf,
  FlowTypes,
  NodeRunner,
  NodeRunners,
} from "@/flow/types.ts";

interface UsageTypes extends FlowTypes {
  nodes: {
    source: { text: string };
    propose: { span: string } | { repair: true };
    judge: { accepted: boolean };
    gate: PassWhenSpec<UsageTypes>;
    apply: undefined;
    synth: undefined;
  };
  artifacts: {
    content: string;
    proposals: string[];
    marks: string[];
    failed: string[];
    decision: { accepted: boolean };
  };
}

const source: NodeRunner<UsageTypes, "source"> = {
  // TODO--capture: the pinned file read happens here in review code.
  execute({ text }, { artifact }) {
    return Promise.resolve([artifact("content", text)]);
  },
};

const propose: NodeRunner<UsageTypes, "propose"> = {
  // TODO--capture: the structured model call happens here; the repair
  // round re-quotes from the failed attempts.
  execute(payload, { inputs, artifact, emit }) {
    if ("repair" in payload) {
      // Woken by the repair gate; with nothing left to repair it stays
      // idle.
      if (inputs.of("failed").length === 0) {
        return Promise.resolve([]);
      }
      const span = inputs.one("content").split(" ")[0];
      emit({ kind: "proposed", span });
      return Promise.resolve([artifact("proposals", [span])]);
    }
    const alreadyFlagged = inputs.of("marks").flat();
    emit({ kind: "proposed", span: payload.span, alreadyFlagged });
    return Promise.resolve([artifact("proposals", [payload.span])]);
  },
};

const judge: NodeRunner<UsageTypes, "judge"> = {
  // TODO--capture: the Jev or cheap model judgement happens here.
  execute({ accepted }, { artifact }) {
    return Promise.resolve([artifact("decision", { accepted })]);
  },
};

const apply: NodeRunner<UsageTypes, "apply"> = {
  // TODO--capture: the serialized VFS mark happens here.
  execute(_, { inputs, artifact, emit }) {
    const content = inputs.one("content");
    const proposals = inputs.of("proposals").flat();
    const [marks, failed] = partition(proposals, (span) =>
      content.includes(span),
    );
    emit({ kind: "applied", placed: marks.length, failed: failed.length });
    const artifacts = [
      artifact("marks", marks),
      ...(failed.length > 0 ? [artifact("failed", failed)] : []),
    ];
    return Promise.resolve(artifacts);
  },
};

const synth: NodeRunner<UsageTypes, "synth"> = {
  // TODO--capture: the structured model call happens here.
  execute(_, { inputs, emit }) {
    const marks = inputs.of("marks").flat();
    emit({ kind: "synthesized", marks });
    return Promise.resolve([]);
  },
};

const runners: NodeRunners<UsageTypes> = {
  source,
  propose,
  judge,
  apply,
  gate: passWhen<UsageTypes, "gate">(),
  synth,
};

// A mark aspect: the repair round is unrolled, gated on the "failed"
// artifact. `prior` wires the apply nodes whose marks this aspect reads.
function markAspect(
  id: string,
  span: string,
  prior: string[] = [],
): FlowNodeOf<UsageTypes>[] {
  return [
    {
      id: `${id}.propose`,
      kind: "propose",
      dependsOn: ["content", ...prior],
      payload: { span },
    },
    {
      id: `${id}.apply`,
      kind: "apply",
      dependsOn: [`${id}.propose`, "content"],
    },
    {
      id: `${id}.repairGate`,
      kind: "gate",
      dependsOn: [`${id}.apply`],
      payload: {
        when: (inputs) => inputs.of("failed").length > 0,
        types: ["failed"],
      },
    },
    {
      id: `${id}.repairPropose`,
      kind: "propose",
      dependsOn: ["content", `${id}.repairGate`],
      payload: { repair: true },
    },
    {
      id: `${id}.repairApply`,
      kind: "apply",
      dependsOn: [`${id}.repairPropose`, "content"],
    },
  ];
}

Deno.test("usage -- mark aspect with the repair round unrolled", async () => {
  const events: FlowEvent[] = [];
  const flow = new FlowRunner<UsageTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  const graph: FlowGraph<UsageTypes> = {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: { text: "alpha bravo" },
      },
      ...markAspect("span", "delta"),
      {
        id: "summary",
        kind: "synth",
        dependsOn: ["span.apply", "span.repairApply"],
      },
    ],
  };

  const _result = await flow.run(graph);

  // TODO--assert: status completed; seven node runs, none skipped
  // TODO--assert: span.apply placed nothing and failed "delta"
  // TODO--assert: span.repairApply placed "alpha"
  // TODO--assert: summary read the marks union of both apply nodes
  // TODO--assert: per node, events arrive as node_start, customs, node_end
});

Deno.test("usage -- two aspects share the same node kinds", async () => {
  const events: FlowEvent[] = [];
  const flow = new FlowRunner<UsageTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  const graph: FlowGraph<UsageTypes> = {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: { text: "alpha bravo" },
      },
      ...markAspect("mechanics", "delta"),
      ...markAspect("structure", "bravo", [
        "mechanics.apply",
        "mechanics.repairApply",
      ]),
      {
        id: "summary",
        kind: "synth",
        dependsOn: [
          "mechanics.apply",
          "mechanics.repairApply",
          "structure.apply",
          "structure.repairApply",
        ],
      },
    ],
  };

  const _result = await flow.run(graph);

  // TODO--assert: both aspects ran the same runner kinds; each execution
  //   saw only its own payload and its own dependency-scoped inputs
  // TODO--assert: structure.propose read mechanics' placed marks through
  //   its edges: alreadyFlagged ["alpha"]
  // TODO--assert: structure.repairPropose stayed idle: mechanics' failed
  //   spans belong to mechanics' repair gate, not to structure
  // TODO--assert: summary read the marks union of both aspects:
  //   ["alpha", "bravo"]
});
