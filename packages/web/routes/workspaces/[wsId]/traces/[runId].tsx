import type { ReviewRun, ReviewRunStatus, TraceEvent } from "@essayist/core";
import type { PageProps } from "fresh";
import { page } from "fresh";
import { MoveLeft } from "lucide-preact";
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

function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ReviewTracePage({
  data,
  state,
}: PageProps<TracePageData, State>) {
  const { run } = data;
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
                <div class="cell min-w-0 flex-1 truncate">{run.path}</div>
                <div class="cell shrink-0">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.completedAt &&
                    ` (${duration(run.completedAt - run.startedAt)})`}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
          <div class="content-layout">
            <div class="content-main min-w-0 py-10">
              {/* node sections land in the next commits */}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
