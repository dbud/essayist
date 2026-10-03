/** A generic DAG runner over typed artifacts. */

/** The host's typing vocabulary: node kinds, artifact types, and custom
 * events. */
export interface FlowTypes {
  nodes: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  /** Custom events hosts emit through the node context. */
  events?: unknown;
}

/** Artifact type keys of a host vocabulary. */
export type ArtifactType<T extends FlowTypes> = keyof T["artifacts"] & string;

/** Node kind keys of a host vocabulary. */
export type NodeKind<T extends FlowTypes> = keyof T["nodes"] & string;

export interface Artifact<
  T extends FlowTypes = FlowTypes,
  A extends ArtifactType<T> = ArtifactType<T>,
> {
  type: A;
  data: T["artifacts"][A];
  /** Id of the producing node, preserved by forwarding helpers. */
  producedBy: string;
}

/** A node in a flow. The payload is opaque host config. Kinds whose
 * vocabulary type is undefined take no payload; for the rest it is
 * required. */
export type FlowNode<
  T extends FlowTypes = FlowTypes,
  K extends NodeKind<T> = NodeKind<T>,
> = {
  id: string;
  kind: K;
  /** Node ids whose committed artifacts arrive as inputs, in order. */
  dependsOn: string[];
} & (undefined extends T["nodes"][K]
  ? { payload?: T["nodes"][K] }
  : { payload: T["nodes"][K] });

/** Dependency artifacts of one node, frozen at its start. */
export interface Artifacts<T extends FlowTypes> {
  /** Everything committed by dependencies, in dependsOn order. */
  readonly all: readonly Artifact<T>[];
  /** Dependency data of one type, in commit order. */
  of<A extends ArtifactType<T>>(type: A): T["artifacts"][A][];
  /** Exactly one dependency datum of a type; throws on zero or several. */
  one<A extends ArtifactType<T>>(type: A): T["artifacts"][A];
  /** Dependency artifacts of one type, in commit order, with provenance. */
  allOf<A extends ArtifactType<T>>(type: A): Artifact<T, A>[];
}

export interface NodeContext<
  T extends FlowTypes,
  K extends NodeKind<T> = NodeKind<T>,
> {
  /** The node's payload, typed by the vocabulary for this kind. */
  payload: T["nodes"][K];
  inputs: Artifacts<T>;
  /** Emit a host event; delivered before this node's terminal event. */
  emit(event: T["events"]): void;
  /** Create an output artifact; provenance is stamped with this node. */
  artifact<A extends ArtifactType<T>>(
    type: A,
    data: T["artifacts"][A],
  ): Artifact<T, A>;
}

export interface NodeRunner<
  T extends FlowTypes,
  K extends NodeKind<T> = NodeKind<T>,
> {
  execute(
    payload: T["nodes"][K],
    ctx: NodeContext<T, K>,
  ): Promise<Artifact<T>[]>;
}

/** One runner per node kind; a missing one is a compile error. */
export type NodeRunners<T extends FlowTypes> = {
  [K in NodeKind<T>]: NodeRunner<T, K>;
};

export interface CompletedNodeRun<T extends FlowTypes = FlowTypes> {
  nodeId: string;
  status: "completed";
  startedAt: number;
  completedAt: number;
  artifacts: Artifact<T>[];
}

export interface FailedNodeRun {
  nodeId: string;
  status: "failed";
  startedAt: number;
  completedAt: number;
  error: string;
}

export interface SkippedNodeRun {
  nodeId: string;
  status: "skipped";
  reason: string;
}

/** The record of a node's execution. */
export type NodeRun<T extends FlowTypes = FlowTypes> =
  | CompletedNodeRun<T>
  | FailedNodeRun
  | SkippedNodeRun;

/** Lifecycle events are engine-emitted; custom events carry host events
 * emitted through the node context. */
export type FlowEvent<T extends FlowTypes = FlowTypes> =
  | { type: "node_start"; nodeId: string }
  | { type: "node_end"; nodeId: string; run: NodeRun<T> }
  | { type: "custom"; nodeId: string; event: T["events"] };

/** The graph's node elements: a union of per-kind nodes, so a literal's
 * payload must agree with its kind. */
export type FlowNodeOf<T extends FlowTypes> = {
  [K in NodeKind<T>]: FlowNode<T, K>;
}[NodeKind<T>];

export interface FlowGraph<T extends FlowTypes = FlowTypes> {
  nodes: FlowNodeOf<T>[];
}

export interface FlowRunResult<T extends FlowTypes = FlowTypes> {
  status: "completed" | "failed";
  /** Failure messages, in the order nodes failed. */
  errors: string[];
  /** One run per node, in declaration order. */
  nodeRuns: NodeRun<T>[];
  /** All committed artifacts, in commit order. */
  artifacts: Artifact<T>[];
}
