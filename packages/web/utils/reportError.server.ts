import { logger } from "@essayist/core";
import { Sentry } from "@/utils/sentry.server.ts";

export function reportError(context: string, error: unknown): void {
  logger.error({ err: error }, context);
  Sentry.captureException(error);
}
