/**
 * Retry policy for model calls.
 *
 * The SDK's own retries cover a failure raised before the stream starts. A
 * connection dropped mid-stream arrives as an error from `getText()`, which
 * RETRY_OPTIONS cannot re-issue, so the round is re-issued here.
 */

import {
  ApiErrorType,
  Code as ResponseErrorCode,
} from "@openrouter/sdk/models";

// Response error codes a re-issue could clear: the code field the SDK writes
// into its error message, plus OpenRouter's canonical error type, which allows
// names outside that field.
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  ResponseErrorCode.ServerError,
  ResponseErrorCode.RateLimitExceeded,
  ResponseErrorCode.VectorStoreTimeout,
  ApiErrorType.ProviderOverloaded,
  ApiErrorType.ProviderUnavailable,
  ApiErrorType.Server,
  ApiErrorType.Timeout,
]);

/**
 * True for a failure worth re-issuing: a rate limit, a server-side fault, or
 * a dropped connection. A schema mismatch is deterministic and goes to the
 * repair path instead.
 */
export function isTransientError(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined && (status === 429 || status >= 500)) return true;

  const code = responseErrorCode(err);
  if (code !== undefined) return TRANSIENT_CODES.has(code);

  return /aborted|network|ECONNRESET|socket hang up|fetch failed/i.test(
    messageOf(err),
  );
}

const FAILED = "Response failed:";

/** The SDK flattens a `response.failed` event into the message of a plain
 * Error (`model-result.js:543`), carrying nothing on the error itself, so the
 * code is read back out of that text. */
function responseErrorCode(err: unknown): string | undefined {
  const message = messageOf(err);
  const start = message.indexOf(FAILED);
  if (start < 0) return undefined;
  try {
    const parsed = JSON.parse(message.slice(start + FAILED.length)) as {
      code?: unknown;
    };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

function statusOf(err: unknown): number | undefined {
  const value = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof value === "number" ? value : undefined;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "";
}
