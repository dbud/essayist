import { Command } from "@cliffy/command";
import type { TraceEvent } from "@essayist/core";
import type { KvctlGlobals } from "@/globals.ts";
import { withKv } from "@/kv.ts";
import { pprint } from "@/utils/pprint.ts";

/**
 * Print a run's trace as reassembled events, so the events can be piped to
 * jq. Chunked values are joined back into whole events, which `explore` shows
 * as raw bytes.
 */
export const trace = new Command<KvctlGlobals>()
  .description("Print a run's trace, one JSON event per document.")
  .arguments("<wsId:string> <runId:string>")
  .option("--summary", "Print one line per event instead of full JSON.")
  .action(({ target, local, summary }, wsId: string, runId: string) =>
    withKv({ target, local }, async ({ traceStore }) => {
      const events = await traceStore.get({ wsId, runId });
      if (!events) {
        console.error(`No trace for run ${runId} in workspace ${wsId}`);
        Deno.exit(1);
      }
      for (const event of events) {
        if (summary) {
          console.log(summarise(event));
        } else {
          pprint(event);
        }
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${events.length} events)`);
    }),
  );

/** One line describing an event, for reading a trace by eye. */
function summarise(event: TraceEvent): string {
  const inner = event.type === "custom" ? event.event : undefined;
  const detail = (() => {
    if (event.type === "node_end") return event.run.status;
    if (!inner) return "";
    switch (inner.type) {
      case "model_call":
        return `${inner.call.model} turn=${inner.call.turnType}`;
      case "output":
        return `keys=${Object.keys((inner.output ?? {}) as object).join(",")}`;
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
