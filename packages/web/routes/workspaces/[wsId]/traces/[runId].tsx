import type {
  ReviewRun,
  ReviewRunStatus,
  TracedReviewEvent,
} from "@essayist/core";
import type { PageProps } from "fresh";
import { page } from "fresh";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  MoveLeft,
  Wrench,
} from "lucide-preact";
import type { ComponentChildren } from "preact";
import MarkdownView from "@/components/MarkdownView.tsx";
import { define, type State } from "@/define.ts";
import Navigation from "@/islands/Navigation.tsx";
import { reviewStore, store, traceStore } from "@/store.ts";

interface TracePageData {
  run: ReviewRun;
  trace: TracedReviewEvent[];
}

export const handler = define.handlers({
  async GET(ctx) {
    const { wsId, runId } = ctx.params;
    if (!(await store.hasAccess(wsId, ctx.state.user.id))) {
      return ctx.redirect("/");
    }
    const run = await reviewStore.getRun({ workspaceId: wsId, id: runId });
    if (!run) {
      return new Response("Review run not found", { status: 404 });
    }
    const trace = (await traceStore.get({ workspaceId: wsId, runId })) ?? [];
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

function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncated payloads arrive as string prefixes; others render as JSON. */
function pretty(value: unknown): string {
  return typeof value === "string"
    ? value
    : (JSON.stringify(value, null, 2) ?? "");
}

interface RoundGroup {
  round: number;
  start: number;
  end?: number;
  events: TracedReviewEvent[];
}

/**
 * Group the trace by round. Tool outputs arrive after their round's
 * round_end, so they are filed by the round recorded on the event.
 */
function groupRounds(trace: TracedReviewEvent[]) {
  const input = trace.find((e) => e.type === "input");
  const rounds: RoundGroup[] = [];
  const orphans: TracedReviewEvent[] = [];
  let current: RoundGroup | undefined;
  for (const event of trace) {
    if (event.type === "round_start") {
      current = { round: event.round, start: event.at, events: [] };
      rounds.push(current);
    } else if (event.type === "round_end") {
      if (current) current.end = event.at;
    } else if (event.type === "input") {
      // Rendered separately above the rounds.
    } else if ("round" in event && event.round !== undefined) {
      const target = rounds.find((r) => r.round === event.round);
      if (target) target.events.push(event);
      else orphans.push(event);
    } else {
      orphans.push(event);
    }
  }
  return { input, rounds, orphans };
}

function totals(trace: TracedReviewEvent[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  for (const event of trace) {
    if (event.type !== "usage") continue;
    inputTokens += event.usage.inputTokens;
    outputTokens += event.usage.outputTokens;
    cost += event.usage.cost ?? 0;
  }
  return { inputTokens, outputTokens, cost };
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

/** Full-width ink section row inside the trace table. */
function SectionHeader({
  title,
  meta,
}: {
  title: ComponentChildren;
  meta?: ComponentChildren;
}) {
  return (
    <div class="col-span-2 flex stack">
      <div class="cell cell--ink min-w-0 flex-1">{title}</div>
      {meta}
    </div>
  );
}

type ToolCallEvent = Extract<TracedReviewEvent, { type: "tool_call" }>;
type ToolOutputEvent = Extract<TracedReviewEvent, { type: "tool_output" }>;

function ReasoningRow({ text }: { text: string }) {
  return (
    <>
      <div class="cell--data">thinking</div>
      <div class="cell--data min-w-0">
        <div class="max-h-72 overflow-y-auto whitespace-pre-wrap">{text}</div>
      </div>
    </>
  );
}

function ToolCallRow({ event }: { event: ToolCallEvent }) {
  return (
    <>
      <div class="cell--data">
        <Wrench size={14} />
        {event.name}
        {event.truncated && (
          <span class="badge badge--warning ml-2 self-start">truncated</span>
        )}
      </div>
      <div class="cell--data min-w-0 break-words">
        <pre class="whitespace-pre-wrap font-mono">{pretty(event.args)}</pre>
      </div>
    </>
  );
}

function ToolOutputRow({ event }: { event: ToolOutputEvent }) {
  return (
    <>
      <div class="cell--data">
        <ArrowRight size={14} />
        output
        {event.truncated && (
          <span class="badge badge--warning ml-2 self-start">truncated</span>
        )}
      </div>
      <div class="cell--data min-w-0 break-words">
        <pre class="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono">
          {pretty(event.output)}
        </pre>
      </div>
    </>
  );
}

function MessageRow({ text }: { text: string }) {
  return (
    <>
      <div class="cell--data">message</div>
      <div class="cell--data min-w-0 break-words">
        <MarkdownView content={text} />
      </div>
    </>
  );
}

function ErrorRow({ error }: { error: string }) {
  return (
    <>
      <div class="cell--data">
        <span class="badge badge--error self-start">error</span>
      </div>
      <div class="cell--data min-w-0 break-words">{error}</div>
    </>
  );
}

function RoundRows({ events }: { events: TracedReviewEvent[] }) {
  const rows: ComponentChildren[] = [];
  for (const event of events) {
    if (event.type === "usage") continue;
    switch (event.type) {
      case "reasoning":
        rows.push(<ReasoningRow key={event.seq} text={event.text} />);
        break;
      case "tool_call":
        rows.push(<ToolCallRow key={event.seq} event={event} />);
        break;
      case "tool_output":
        rows.push(<ToolOutputRow key={event.seq} event={event} />);
        break;
      case "message":
        rows.push(<MessageRow key={event.seq} text={event.text} />);
        break;
      case "error":
        rows.push(<ErrorRow key={event.seq} error={event.error} />);
        break;
    }
  }
  return rows;
}

function RoundSection({ group }: { group: RoundGroup }) {
  const usage = totals(group.events);
  return (
    <>
      <SectionHeader
        title={`Round ${group.round}`}
        meta={
          <>
            {group.end !== undefined && (
              <div class="cell cell--ink shrink-0">
                {duration(group.end - group.start)}
              </div>
            )}
            <div class="cell cell--ink shrink-0">
              <TokenUsage
                inputTokens={usage.inputTokens}
                outputTokens={usage.outputTokens}
              />
            </div>
          </>
        }
      />
      {RoundRows({ events: group.events })}
    </>
  );
}

export default function ReviewTracePage({
  data,
  state,
}: PageProps<TracePageData, State>) {
  const { run, trace } = data;
  const { input, rounds, orphans } = groupRounds(trace);
  const t = totals(trace);
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col stack stack--col min-h-0 @container">
        <Navigation user={state.user}>
          <div class="flex stack stack--row">
            <a href="/" class="btn">
              <MoveLeft size={16} />
            </a>
            <div class="cell">Review trace</div>
          </div>
        </Navigation>
        <div class="z-toolbar flex flex-col bg-surface shadow-md">
          <div class="content-layout">
            <div class="content-main min-w-0">
              <div class="flex stack stack--row">
                <div class="cell shrink-0">
                  <span class="self-start">{statusBadge(run.status)}</span>
                </div>
                <div class="cell min-w-0 flex-1 truncate">{run.fileId}</div>
                <div class="cell shrink-0">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.completedAt &&
                    ` (${duration(run.completedAt - run.startedAt)})`}
                </div>
                <div class="cell shrink-0">
                  <TokenUsage
                    inputTokens={t.inputTokens}
                    outputTokens={t.outputTokens}
                  />
                  {t.cost > 0 && ` · $${t.cost.toFixed(4)}`}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
          <div class="content-layout">
            <div class="content-main min-w-0 py-10">
              <div class="grid grid-cols-[auto_1fr] stack stack--col stack--row">
                {input && (
                  <>
                    <SectionHeader
                      title="input"
                      meta={
                        <div class="cell cell--ink shrink-0">
                          {input.text.length} chars
                        </div>
                      }
                    />
                    <div class="cell--data col-span-2 min-w-0">
                      <div class="whitespace-pre-wrap">{input.text}</div>
                    </div>
                  </>
                )}
                {rounds.map((group) => (
                  <RoundSection key={group.round} group={group} />
                ))}
                {orphans.map((event) => (
                  <ErrorRow
                    key={event.seq}
                    error={event.type === "error" ? event.error : pretty(event)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
