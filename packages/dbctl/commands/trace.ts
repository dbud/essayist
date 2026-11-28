import { Command } from "@cliffy/command";
import { pluralize, type TraceEvent, TraceEvents, WorkspaceId } from "@essayist/core";
import { Console, Effect } from "effect";

import { CommandError, type DbctlGlobals, runStore } from "#/db.ts";
import { pretty } from "#/utils/pretty.ts";

export const trace = new Command<DbctlGlobals>()
  .description("Print the trace of a run, a JSON event per document, so it can be piped to jq.")
  .arguments("<wsId:string> <runId:string>")
  .option("--summary", "Print one line per event instead of full JSON.")
  .action((options, wsId: string, runId: string) =>
    runStore(
      options,
      Effect.gen(function* () {
        const events = yield* TraceEvents.use((traces) => traces.get(runId));
        if (events.length === 0) {
          return yield* new CommandError({
            message: `No trace for run ${runId} in workspace ${wsId}`,
          });
        }
        for (const event of events) {
          yield* Console.log(options.summary ? summarise(event) : pretty(event));
        }
        // footer goes to stderr so piped stdout stays pure JSON
        yield* Console.error(`(${events.length} ${pluralize(events.length, "event", "events")})`);
      }).pipe(Effect.provideService(WorkspaceId, { wsId })),
    ),
  );

/** One line describing an event, for reading a trace by eye. */
function summarise(event: TraceEvent): string {
  const inner = event.type === "custom" ? event.event : undefined;
  const detail = (() => {
    if (event.type === "node_end") return event.run.status;
    if (!inner) return "";
    switch (inner.type) {
      case "model_call":
        return `${inner.call.model} ${inner.call.durationMs}ms`;
      case "output":
        return `keys=${Object.keys(inner.output ?? {}).join(",")}`;
      case "prompt":
      case "reasoning":
        return `len=${inner.text.length}`;
      case "repair":
        return `error=${inner.error.slice(0, 60)}`;
      default:
        return "";
    }
  })();
  return [
    String(event.seq).padStart(3, " "),
    inner?.type ?? event.type,
    "nodeId" in event ? event.nodeId : "",
    detail,
  ]
    .filter(Boolean)
    .join("\t");
}
