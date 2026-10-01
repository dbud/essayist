import type {
  MarkAttempt,
  PostModelCallPayload,
  ReviewRun,
  ReviewRunStatus,
  TraceEvent,
  TraceNodeView,
} from "@essayist/core";
import { groupTraceNodes } from "@essayist/core";
import type { PageProps } from "fresh";
import { page } from "fresh";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Brain,
  Cpu,
  Milestone,
  MoveLeft,
  RotateCcw,
  Type,
  Wrench,
} from "lucide-preact";
import type { ComponentChildren } from "preact";
import MarkdownView from "@/components/MarkdownView.tsx";
import { define, type State } from "@/define.ts";
import Navigation from "@/islands/Navigation.tsx";
import { reviewStore, traceStore, workspaceStore } from "@/store.ts";

interface TracePageData {
  run: ReviewRun;
  trace: TraceEvent[];
}

export const handler = define.handlers({
  async GET(ctx) {
    const { wsId, runId } = ctx.params;
    if (!(await workspaceStore.hasAccess(wsId, ctx.state.user.id))) {
      return ctx.redirect("/");
    }
    const run = await reviewStore.getRun({ wsId, id: runId });
    if (!run) {
      return new Response("Review run not found", { status: 404 });
    }
    const trace = (await traceStore.get({ wsId, runId })) ?? [];
    return page({ run, trace });
  },
});

function statusBadge(status: ReviewRunStatus) {
  const classes =
    status === "completed"
      ? "badge badge--success"
      : status === "failed"
        ? "badge badge--error"
        : "badge badge--warning";
  return <span class={classes}>{status}</span>;
}

/** Editor URL that opens this run's file in replay mode. */
function replayHref(run: ReviewRun): string {
  return (
    `/?ws=${encodeURIComponent(run.wsId)}` +
    `&file=${encodeURIComponent(run.path)}` +
    `&replay=${run.id}`
  );
}

function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

function TokenUsage({
  inputTokens,
  outputTokens,
}: {
  inputTokens: number;
  outputTokens: number;
}) {
  return (
    <span class="flex gap-1">
      <ArrowDown size={14} />
      {inputTokens}
      <ArrowUp size={14} />
      {outputTokens}
    </span>
  );
}

/** Full-width row that opens a section; the tone picks the title style. */
function SectionHeader({
  title,
  meta,
  tone = "ink",
}: {
  title: ComponentChildren;
  meta?: ComponentChildren;
  /** unit for the red group headers, idle for nodes that made no call. */
  tone?: "ink" | "unit" | "idle";
}) {
  const titleClass = `cell min-w-0 flex-1 ${
    tone === "unit" ? "cell--accent" : tone === "idle" ? "striped" : "cell--ink"
  }`;
  return (
    <div class="col-span-3 flex stack">
      <div class={titleClass}>{title}</div>
      {meta}
    </div>
  );
}

function PromptRow({ text }: { text: string }) {
  return (
    <>
      <div class="cell--data">
        <Type size={14} />
        prompt
      </div>
      <div class="cell--data col-span-2 min-w-0 max-h-72 overflow-y-auto break-words">
        <MarkdownView content={text} class="code-wrap min-w-0" />
      </div>
    </>
  );
}

function ReasoningRow({ text }: { text: string }) {
  return (
    <>
      <div class="cell--data">
        <Brain size={14} />
        thinking
      </div>
      <div class="cell--data col-span-2 min-w-0 max-h-72 overflow-y-auto break-words">
        <MarkdownView content={text} class="code-wrap min-w-0" />
      </div>
    </>
  );
}

function RepairRow({ raw, error }: { raw: string; error: string }) {
  return (
    <>
      <div class="cell--data">
        <AlertTriangle size={14} />
        re-asked
      </div>
      <div class="cell--data col-span-2 min-w-0 max-h-72 overflow-y-auto break-words">
        <div class="flex flex-col gap-2">
          <div class="text-xs text-error">{error}</div>
          <pre class="min-w-0 whitespace-pre-wrap font-mono">{raw}</pre>
        </div>
      </div>
    </>
  );
}

function OutputRow({ output }: { output: unknown }) {
  return (
    <>
      <div class="cell--data">
        <ArrowRight size={14} />
        output
      </div>
      <div class="cell--data col-span-2 min-w-0 max-h-72 overflow-y-auto break-words">
        <pre class="min-w-0 whitespace-pre-wrap font-mono">
          {pretty(output)}
        </pre>
      </div>
    </>
  );
}

function AttemptRow({ attempt }: { attempt: MarkAttempt }) {
  return (
    <div class="cell--data col-span-2 min-w-0 max-h-72 overflow-y-auto break-words flex flex-col gap-1">
      <div class="flex gap-2 items-start">
        <span
          class={`badge ${attempt.marked ? "badge--success" : "badge--error"} self-start`}
        >
          {attempt.marked ? "placed" : "failed"}
        </span>
        {attempt.label && <span class="self-start">{attempt.label}</span>}
      </div>
      <div class="whitespace-pre-wrap break-words">{attempt.selected_text}</div>
      <MarkdownView content={attempt.comment} class="code-wrap min-w-0" />
      {attempt.error && (
        <div class="text-[0.75rem] text-error">{attempt.error}</div>
      )}
    </div>
  );
}

function AppliedRow({ attempts }: { attempts: MarkAttempt[] }) {
  return (
    <>
      <div class="cell--data">
        <Wrench size={14} />
        applied
      </div>
      <div class="col-span-2 min-w-0 flex flex-col stack">
        {attempts.map((attempt) => (
          <AttemptRow
            key={attempt.mark_id ?? attempt.selected_text}
            attempt={attempt}
          />
        ))}
      </div>
    </>
  );
}

function ModelCallRow({ call }: { call: PostModelCallPayload }) {
  const cost = call.usage?.cost;
  return (
    <>
      <div class="cell--data">
        <Cpu size={14} />
        model
      </div>
      <div class="cell--data col-span-2 min-w-0 break-words gap-2">
        <span>{call.model}</span>
        <span>{call.turnType}</span>
        <span>{(call.durationMs / 1000).toFixed(1)}s</span>
        <span>{cost !== undefined && cost > 0 && `$${cost.toFixed(4)}`}</span>
      </div>
    </>
  );
}

type NodeEvent = TraceNodeView["events"][number];

function EventRow({ event }: { event: NodeEvent }) {
  switch (event.type) {
    case "prompt":
      return <PromptRow text={event.text} />;
    case "reasoning":
      return <ReasoningRow text={event.text} />;
    case "output":
      return <OutputRow output={event.output} />;
    case "repair":
      return <RepairRow raw={event.raw} error={event.error} />;
    case "model_call":
      return <ModelCallRow call={event.call} />;
    case "applied":
      // A repair round with nothing to place reports an empty attempt
      // list; there is nothing to show.
      return event.attempts.length > 0 ? (
        <AppliedRow attempts={event.attempts} />
      ) : null;
  }
}

/** The unit a node belongs to: the id prefix before the first dot. */
function unitOf(nodeId: string): string {
  const dot = nodeId.indexOf(".");
  return dot === -1 ? nodeId : nodeId.slice(0, dot);
}

function NodeSection({ node }: { node: TraceNodeView }) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  for (const event of node.events) {
    if (event.type !== "model_call" || !event.call.usage) continue;
    inputTokens += event.call.usage.inputTokens;
    outputTokens += event.call.usage.outputTokens;
    cost += event.call.usage.cost ?? 0;
  }
  const done = node.status === "completed" || node.status === "failed";
  // A node that made no model call (source, gate, collect, an idle
  // repair) has no work to show, so it reads as a muted stripe.
  const idle = node.events.every((event) => event.type !== "model_call");
  const metaCell = `cell shrink-0 ${idle ? "striped" : "cell--ink"}`;
  return (
    <>
      <SectionHeader
        title={
          <span class="flex gap-2">
            <Milestone size={14} />
            {node.nodeId}
          </span>
        }
        tone={idle ? "idle" : "ink"}
        meta={
          <>
            {node.status === "failed" && (
              <div class={metaCell}>
                <span class="badge badge--error self-start">failed</span>
              </div>
            )}
            {node.status === "skipped" && (
              <div class={metaCell}>
                <span class="badge badge--warning self-start">skipped</span>
              </div>
            )}
            {done &&
              node.startedAt !== undefined &&
              node.completedAt !== undefined && (
                <div class={metaCell}>
                  {duration(node.completedAt - node.startedAt)}
                </div>
              )}
            {(inputTokens > 0 || outputTokens > 0) && (
              <div class={metaCell}>
                <TokenUsage
                  inputTokens={inputTokens}
                  outputTokens={outputTokens}
                />
                {cost > 0 && ` · $${cost.toFixed(4)}`}
              </div>
            )}
          </>
        }
      />
      {node.status === "failed" && node.error && (
        <div class="cell--data col-span-3 min-w-0 break-words">
          {node.error}
        </div>
      )}
      {node.status === "skipped" && node.reason && (
        <div class="cell--data col-span-3 min-w-0 break-words">
          {node.reason}
        </div>
      )}
      {node.events.map((event, i) => (
        <EventRow key={i} event={event} />
      ))}
    </>
  );
}

/** Nodes sharing a unit, in first-start order. */
function groupUnits(nodes: TraceNodeView[]) {
  const byUnit = new Map<string, TraceNodeView[]>();
  for (const node of nodes) {
    const unit = unitOf(node.nodeId);
    const group = byUnit.get(unit);
    if (group) group.push(node);
    else byUnit.set(unit, [node]);
  }
  return [...byUnit].map(([unit, group]) => ({ unit, nodes: group }));
}

export default function ReviewTracePage({
  data,
  state,
}: PageProps<TracePageData, State>) {
  const { run, trace } = data;
  const view = groupTraceNodes(trace);
  const units = groupUnits(view.nodes);
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col stack stack--col min-h-0 @container">
        <Navigation user={state.user}>
          <div class="flex stack stack--row">
            <a href="/" class="btn">
              <MoveLeft size={16} />
            </a>
            <div class="cell">Review trace</div>
            <a
              href={replayHref(run)}
              class="btn"
              title="Replay this run in the editor"
            >
              <RotateCcw size={16} />
              Replay...
            </a>
          </div>
        </Navigation>
        <div class="z-toolbar flex flex-col bg-surface shadow-md">
          <div class="content-layout">
            <div class="content-main min-w-0">
              <div class="flex stack stack--row">
                <div class="cell shrink-0">
                  <span class="self-start">{statusBadge(run.status)}</span>
                </div>
                <div class="cell min-w-0 flex-1 truncate">{run.path}</div>
                <div class="cell shrink-0">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.completedAt &&
                    ` (${duration(run.completedAt - run.startedAt)})`}
                </div>
                <div class="cell shrink-0">
                  <TokenUsage
                    inputTokens={view.totals.inputTokens}
                    outputTokens={view.totals.outputTokens}
                  />
                  {view.totals.cost > 0 && ` · $${view.totals.cost.toFixed(4)}`}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
          <div class="content-layout">
            <div class="content-main min-w-0 py-10">
              {view.nodes.length === 0 && view.orphans.length === 0 ? (
                <div class="cell--data">No trace events recorded.</div>
              ) : (
                <div class="grid grid-cols-3 stack stack--col stack--row">
                  {units.flatMap(({ unit, nodes }) => [
                    unit !== "content" && (
                      <SectionHeader
                        key={`unit-${unit}`}
                        title={unit}
                        tone="unit"
                      />
                    ),
                    ...nodes.map((node) => (
                      <NodeSection key={node.nodeId} node={node} />
                    )),
                  ])}
                  {view.orphans.map((event) => (
                    <div class="cell--data col-span-3 min-w-0" key={event.seq}>
                      {pretty(event)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
