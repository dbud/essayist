import { distinct, sortBy } from "@std/collections";
import { Cause, Deferred, Effect, Exit, Result } from "effect";
import type {
  Artifact,
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
import { FlowGraphError } from "@/flow/types.ts";
import { view } from "@/flow/view.ts";

export interface FlowRunnerOptions<T extends FlowTypes, R = never> {
  runners: NodeRunners<T, R>;
  /** Called per event, in emission order; a listener defect is logged and
   * ignored. */
  onEvent?: (event: FlowEvent<T>) => Effect.Effect<void>;
  /** Max nodes executing at once. Default unbounded. */
  maxConcurrency?: number;
}

export interface FlowRunOptions<T extends FlowTypes> {
  /** Nodes an earlier attempt completed, with what they committed. Skipped
   * and seeded; their events stay in the trace rather than replaying here. */
  completed?: ReadonlyMap<string, Artifact<T>[]>;
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
 * commits artifacts. Nodes never re-execute. Each node runs on its own
 * child fiber, so an interrupted run takes its in-flight nodes down. */
export class FlowRunner<T extends FlowTypes, R = never> {
  #runners = new Map<string, NodeRunner<T, NodeKind<T>, R>>();
  #onEvent?: (event: FlowEvent<T>) => Effect.Effect<void>;
  #maxConcurrency: number;

  constructor(options: FlowRunnerOptions<T, R>) {
    // The registry key is the node kind, so the cast is sound.
    const registry = options.runners as unknown as Record<
      string,
      NodeRunner<T, NodeKind<T>, R>
    >;
    for (const [kind, runner] of Object.entries(registry)) {
      this.#runners.set(kind, runner);
    }
    this.#onEvent = options.onEvent;
    this.#maxConcurrency = options.maxConcurrency ?? Number.POSITIVE_INFINITY;
  }

  run(
    graph: FlowGraph<T>,
    options: FlowRunOptions<T> = {},
  ): Effect.Effect<FlowRunResult<T>, FlowGraphError, R> {
    return Effect.gen({ self: this }, function* () {
      const wiredResult = wire(graph, this.#runners);
      if (Result.isFailure(wiredResult)) {
        return yield* Effect.fail(wiredResult.failure);
      }
      const wired = wiredResult.success;

      const committed = new Map<string, Artifact<T>[]>();
      const artifacts: Artifact<T>[] = [];
      const nodeRuns: NodeRun<T>[] = [];
      /** Completed on each node's fiber once its outcome is recorded;
       * the scheduler wakes on the node id. */
      const pending = new Map<string, Deferred.Deferred<string, never>>();
      const errors = new Map<string, string>();

      const commit = (entry: WiredNode<T>, produced: Artifact<T>[]): void => {
        committed.set(entry.node.id, produced);
        artifacts.push(...produced);
        for (const id of entry.consumedBy) {
          const consumer = wired.get(id);
          if (consumer !== undefined) consumer.remaining -= 1;
        }
      };

      for (const entry of wired.values()) {
        const completed = options.completed?.get(entry.node.id);
        if (completed === undefined) continue;
        commit(entry, completed);
        entry.launched = true;
      }

      const launch = (entry: WiredNode<T>) =>
        Effect.gen({ self: this }, function* () {
          entry.launched = true;
          const waker = yield* Deferred.make<string>();
          pending.set(entry.node.id, waker);
          const inputs = entry.consumes.flatMap(
            (dep) => committed.get(dep) ?? [],
          );
          // Mutations stay on the engine's single thread, on the node's fiber
          // in completion order: record, commit, then wake the scheduler.
          yield* Effect.forkChild(
            Effect.gen({ self: this }, function* () {
              const run = yield* this.#execute(entry.node, inputs);
              nodeRuns.push(run);
              if (run.status === "completed") {
                commit(entry, run.artifacts);
              } else {
                errors.set(entry.node.id, run.error);
              }
              yield* Deferred.succeed(waker, entry.node.id);
            }),
          );
        });

      while (true) {
        for (const entry of wired.values()) {
          if (pending.size >= this.#maxConcurrency) break;
          if (!entry.launched && entry.remaining === 0) {
            yield* launch(entry);
          }
        }
        if (pending.size === 0) break;
        const doneId = yield* Effect.raceAll(
          [...pending.values()].map((waker) => Deferred.await(waker)),
        );
        pending.delete(doneId);
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
        yield* this.#emit({ type: "node_end", nodeId: entry.node.id, run });
      }

      const position = new Map(
        wired.keys().map((nodeId, index) => [nodeId, index] as const),
      );
      const status: FlowRunResult<T>["status"] =
        errors.size === 0 ? "completed" : "failed";
      return {
        status,
        errors: [...errors.values()],
        nodeRuns: sortBy(nodeRuns, (run) => position.get(run.nodeId) ?? 0),
        artifacts,
      };
    });
  }

  #execute(
    node: FlowNode<T, NodeKind<T>>,
    inputs: readonly Artifact<T>[],
  ): Effect.Effect<CompletedNodeRun<T> | FailedNodeRun, never, R> {
    return Effect.gen({ self: this }, function* () {
      const startedAt = Date.now();
      yield* this.#emit({ type: "node_start", nodeId: node.id });

      // The payload boundary: the host's graph construction guarantees
      // configured kinds carry their payload.
      const payload = node.payload as T["nodes"][NodeKind<T>];
      const context: NodeContext<T, NodeKind<T>> = {
        payload,
        inputs: view(inputs),
        emit: (event) => this.#emit({ type: "custom", nodeId: node.id, event }),
        artifact: (type, data) => ({
          type,
          data,
          producedBy: node.id,
        }),
      };
      const runner = this.#runners.get(node.kind);
      const attempt: Effect.Effect<Artifact<T>[], Error, R> =
        runner === undefined
          ? Effect.fail(new Error(`no runner for node kind "${node.kind}"`))
          : runner.execute(payload, context);
      const exit = yield* Effect.exit(attempt);

      const run: CompletedNodeRun<T> | FailedNodeRun = Exit.isSuccess(exit)
        ? {
            nodeId: node.id,
            status: "completed",
            startedAt,
            completedAt: Date.now(),
            artifacts: exit.value,
          }
        : {
            nodeId: node.id,
            status: "failed",
            startedAt,
            completedAt: Date.now(),
            error: describe(exit.cause),
          };
      yield* this.#emit({ type: "node_end", nodeId: node.id, run });
      return run;
    });
  }

  /** A listener defect is logged and dropped, not failed into the run. */
  #emit(event: FlowEvent<T>): Effect.Effect<void> {
    return Effect.catchDefect(this.#onEvent?.(event) ?? Effect.void, (defect) =>
      Effect.logError("flow event listener failed", {
        error: asMessage(defect),
      }),
    );
  }
}

/** Wires the graph for execution, rejecting broken graphs before any
 * node runs. */
function wire<T extends FlowTypes, R>(
  graph: FlowGraph<T>,
  runners: Map<string, NodeRunner<T, NodeKind<T>, R>>,
): Result.Result<Map<string, WiredNode<T>>, FlowGraphError> {
  const wired = new Map<string, WiredNode<T>>();

  for (const node of graph.nodes) {
    if (wired.has(node.id)) {
      return Result.fail(
        new FlowGraphError({ reason: `duplicate node id "${node.id}"` }),
      );
    }
    if (!runners.has(node.kind)) {
      return Result.fail(
        new FlowGraphError({
          reason: `no runner for node kind "${node.kind}"`,
        }),
      );
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
        return Result.fail(
          new FlowGraphError({
            reason: `node "${entry.node.id}" depends on unknown node "${dep}"`,
          }),
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
    return Result.fail(
      new FlowGraphError({ reason: `cycle detected: ${stuck.join(", ")}` }),
    );
  }
  return Result.succeed(wired);
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

/** One-line text for a node's cause: the first typed error or defect. */
function describe(cause: Cause.Cause<unknown>): string {
  const error = Cause.findError(cause);
  if (Result.isSuccess(error)) return asMessage(error.success);
  const defect = Cause.findDefect(cause);
  if (Result.isSuccess(defect)) return asMessage(defect.success);
  return "interrupted";
}

function asMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
