import { distinct, sortBy } from "@std/collections";
import type {
  Artifact,
  Artifacts,
  ArtifactType,
  CompletedNodeRun,
  FailedNodeRun,
  FlowEvent,
  FlowGraph,
  FlowNode,
  FlowRunResult,
  FlowTypes,
  NodeContext,
  NodeKind,
  NodeRun,
  NodeRunner,
  NodeRunners,
  SkippedNodeRun,
} from "@/flow/types.ts";

export interface FlowRunnerOptions<T extends FlowTypes> {
  runners: NodeRunners<T>;
  /** Awaited per event; a throwing listener is logged and ignored. */
  onEvent?: (event: FlowEvent<T>) => Promise<void> | void;
  /** Max nodes executing at once. Default unbounded. */
  maxConcurrency?: number;
}

/** Scheduling state for a node. */
interface WiredNode<T extends FlowTypes> {
  node: FlowNode<T, NodeKind<T>>;
  /** Deduped dependsOn list, in declared order. */
  consumes: string[];
  /** Node ids that consume this node's artifacts. */
  consumedBy: string[];
  /** Deps not yet completed. */
  remaining: number;
  launched: boolean;
}

/** Executes a graph: schedules ready nodes in declaration order and
 * commits artifacts. Nodes never re-execute. */
export class FlowRunner<T extends FlowTypes> {
  #runners = new Map<string, NodeRunner<T>>();
  #onEvent?: (event: FlowEvent<T>) => Promise<void> | void;
  #maxConcurrency: number;

  constructor(options: FlowRunnerOptions<T>) {
    // The registry key is the node kind, so the cast is sound.
    const registry = options.runners as unknown as Record<
      string,
      NodeRunner<T>
    >;
    for (const [kind, runner] of Object.entries(registry)) {
      this.#runners.set(kind, runner);
    }
    this.#onEvent = options.onEvent;
    this.#maxConcurrency = options.maxConcurrency ?? Number.POSITIVE_INFINITY;
  }

  async run(graph: FlowGraph<T>): Promise<FlowRunResult<T>> {
    const wired = wire(graph, this.#runners);
    const committed = new Map<string, Artifact<T>[]>();
    const artifacts: Artifact<T>[] = [];
    const nodeRuns: NodeRun[] = [];
    const running = new Set<Promise<void>>();
    const errors = new Map<string, string>();

    const launch = async (entry: WiredNode<T>): Promise<void> => {
      entry.launched = true;
      const { promise, resolve } = Promise.withResolvers<void>();
      running.add(promise);
      try {
        const run = await this.#execute(
          entry.node,
          entry.consumes,
          committed,
          artifacts,
        );
        nodeRuns.push(run);
        if (run.status === "completed") {
          for (const id of entry.consumedBy) {
            const consumer = wired.get(id);
            if (consumer !== undefined) {
              consumer.remaining -= 1;
            }
          }
        } else {
          errors.set(entry.node.id, run.error);
        }
      } finally {
        running.delete(promise);
        resolve();
      }
    };

    while (true) {
      for (const entry of wired.values()) {
        if (running.size >= this.#maxConcurrency) break;
        if (!entry.launched && entry.remaining === 0) {
          void launch(entry);
        }
      }
      if (running.size === 0) break;
      await Promise.race([...running]);
    }

    for (const entry of wired
      .values()
      .filter((candidate) => !candidate.launched)) {
      const run: SkippedNodeRun = {
        nodeId: entry.node.id,
        status: "skipped",
        reason: skipReason(entry, wired, errors),
      };
      nodeRuns.push(run);
      await this.#emit({ type: "node_end", nodeId: entry.node.id, run });
    }

    const position = new Map(
      wired.keys().map((nodeId, index) => [nodeId, index] as const),
    );
    return {
      status: errors.size === 0 ? "completed" : "failed",
      errors: [...errors.values()],
      nodeRuns: sortBy(nodeRuns, (run) => position.get(run.nodeId) ?? 0),
      artifacts,
    };
  }

  async #execute(
    node: FlowNode<T, NodeKind<T>>,
    deps: readonly string[],
    committed: Map<string, Artifact<T>[]>,
    artifacts: Artifact<T>[],
  ): Promise<CompletedNodeRun | FailedNodeRun> {
    const startedAt = Date.now();
    await this.#emit({ type: "node_start", nodeId: node.id });

    const inputs: Artifact<T>[] = [];
    for (const dep of deps) {
      inputs.push(...(committed.get(dep) ?? []));
    }
    const eventQueue: T["events"][] = [];
    // The payload boundary: the host's graph construction guarantees
    // configured kinds carry their payload.
    const payload = node.payload as T["nodes"][NodeKind<T>];
    const context: NodeContext<T, NodeKind<T>> = {
      payload,
      inputs: view(inputs),
      emit: (event) => eventQueue.push(event),
      artifact: (type, data) => ({
        type,
        data,
        producedBy: node.id,
      }),
    };
    let error: string | undefined;
    try {
      const runner = this.#runners.get(node.kind);
      if (runner === undefined) {
        throw new Error(`no runner for node kind "${node.kind}"`);
      }
      const produced = await runner.execute(payload, context);
      committed.set(node.id, produced);
      artifacts.push(...produced);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    for (const event of eventQueue) {
      await this.#emit({ type: "custom", nodeId: node.id, event });
    }
    const run: CompletedNodeRun | FailedNodeRun =
      error === undefined
        ? {
            nodeId: node.id,
            status: "completed",
            startedAt,
            completedAt: Date.now(),
          }
        : {
            nodeId: node.id,
            status: "failed",
            startedAt,
            completedAt: Date.now(),
            error,
          };
    await this.#emit({ type: "node_end", nodeId: node.id, run });
    return run;
  }

  async #emit(event: FlowEvent<T>): Promise<void> {
    try {
      await this.#onEvent?.(event);
    } catch (caught) {
      console.error("flow event listener failed", caught);
    }
  }
}

/** Wires the graph for execution, rejecting broken graphs before any
 * node runs. */
function wire<T extends FlowTypes>(
  graph: FlowGraph<T>,
  runners: Map<string, NodeRunner<T>>,
): Map<string, WiredNode<T>> {
  const wired = new Map<string, WiredNode<T>>();

  for (const node of graph.nodes) {
    if (wired.has(node.id)) {
      throw new Error(`duplicate node id "${node.id}"`);
    }
    if (!runners.has(node.kind)) {
      throw new Error(`no runner for node kind "${node.kind}"`);
    }
    const consumes = distinct(node.dependsOn);
    wired.set(node.id, {
      node,
      consumes,
      consumedBy: [],
      remaining: consumes.length,
      launched: false,
    });
  }
  for (const entry of wired.values()) {
    for (const dep of entry.consumes) {
      const upstream = wired.get(dep);
      if (upstream === undefined) {
        throw new Error(
          `node "${entry.node.id}" depends on unknown node "${dep}"`,
        );
      }
      upstream.consumedBy.push(entry.node.id);
    }
  }

  // Leftover in-degree after the drain is a cycle.
  const drained = new Map<string, number>();
  for (const [id, entry] of wired) {
    drained.set(id, entry.remaining);
  }
  const queue = wired
    .values()
    .filter((entry) => entry.remaining === 0)
    .map((entry) => entry.node.id)
    .toArray();
  while (queue.length > 0) {
    const id = queue.shift() ?? "";
    for (const consumer of wired.get(id)?.consumedBy ?? []) {
      const left = (drained.get(consumer) ?? 1) - 1;
      drained.set(consumer, left);
      if (left === 0) queue.push(consumer);
    }
  }
  const stuck = wired
    .values()
    .filter((entry) => (drained.get(entry.node.id) ?? 0) > 0)
    .map((entry) => entry.node.id)
    .toArray();
  if (stuck.length > 0) {
    throw new Error(`cycle detected: ${stuck.join(", ")}`);
  }
  return wired;
}

/** The reason a node never ran: its nearest failed dependency. */
function skipReason<T extends FlowTypes>(
  entry: WiredNode<T>,
  wired: Map<string, WiredNode<T>>,
  errors: Map<string, string>,
): string {
  const visited = new Set<string>([entry.node.id]);
  const queue = [...entry.consumes];
  while (queue.length > 0) {
    const id = queue.shift() ?? "";
    if (visited.has(id)) continue;
    visited.add(id);
    const error = errors.get(id);
    if (error !== undefined) {
      return `dependency "${id}" failed: ${error}`;
    }
    const upstream = wired.get(id);
    if (upstream !== undefined && !upstream.launched) {
      queue.push(...upstream.consumes);
    }
  }
  return `upstream failure: ${[...errors.values()].join("; ")}`;
}

/** The input view handed to a node. Type-scoped reads trust artifact
 * data to match the vocabulary's declared data types. */
function view<T extends FlowTypes>(
  inputs: readonly Artifact<T>[],
): Artifacts<T> {
  const matching = <A extends ArtifactType<T>>(type: A): Artifact<T, A>[] =>
    inputs.filter(
      (artifact): artifact is Artifact<T, A> => artifact.type === type,
    );
  return {
    all: inputs,
    allOf: matching,
    of: <A extends ArtifactType<T>>(type: A): T["artifacts"][A][] =>
      matching(type).map((artifact) => artifact.data),
    one: <A extends ArtifactType<T>>(type: A): T["artifacts"][A] => {
      const matches = matching(type);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly one "${String(type)}" artifact, got ${matches.length}`,
        );
      }
      return matches[0].data;
    },
  };
}
