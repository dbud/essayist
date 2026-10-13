import { Effect } from "effect";
import { runtime } from "@/store.ts";
import { Sentry } from "@/utils/sentry.server.ts";

export function reportError(context: string, error: unknown): void {
  runtime.runFork(
    Effect.logError(context, {
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  Sentry.captureException(error);
}
