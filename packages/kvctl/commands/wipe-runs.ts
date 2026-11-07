import { Command } from "@cliffy/command";

import type { KvctlGlobals } from "#/globals.ts";
import { database } from "#/kv.ts";

// Old kv-shaped rows wipe through the regular wipe command.
export const wipeRuns = new Command<KvctlGlobals>()
  .description("Delete review runs and their trace rows from the run tables.")
  .arguments("<wsId:string> [runId:string]")
  .action(async ({ local, target }, wsId: string, runId?: string) => {
    const where = runId === undefined ? "ws_id = ?" : "ws_id = ? AND id = ?";
    const params = runId === undefined ? [wsId] : [wsId, runId];
    const deleted: number[] = [];
    for (const [table, key] of [
      ["review_runs", "id"],
      ["review_trace_events", "run_id"],
    ] as const) {
      const response = (await database({ local, target })
        .prepare(`DELETE FROM ${table} WHERE ${where} RETURNING ${key}`)
        .bind(...params)
        .all()) as {
        results?: Record<string, unknown>[];
        error?: unknown;
      };
      if (response.error !== undefined) {
        console.error(JSON.stringify(response.error));
        process.exit(1);
      }
      deleted.push(response.results?.length ?? 0);
    }
    console.log(`deleted ${deleted[0]} runs, ${deleted[1]} trace entries`);
  });
