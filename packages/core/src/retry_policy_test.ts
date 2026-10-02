import {
  ApiErrorType,
  Code as ResponseErrorCode,
} from "@openrouter/sdk/models";
import { assertEquals } from "@std/assert";
import { isTransientError } from "./retry_policy.ts";

/** The SDK flattens a failed response into this message; from a real run. */
const STREAM_ABORT =
  'Response failed: {"code":"server_error","message":"The operation was aborted"}';

const failed = (code: string) =>
  new Error(`Response failed: {"code":"${code}","message":"x"}`);

Deno.test("isTransientError -- a mid-stream abort is transient", () => {
  assertEquals(isTransientError(new Error(STREAM_ABORT)), true);
});

Deno.test("isTransientError -- rate limits and server errors are transient", () => {
  assertEquals(
    isTransientError({ statusCode: 429, message: "slow down" }),
    true,
  );
  assertEquals(isTransientError({ statusCode: 500, message: "boom" }), true);
  assertEquals(isTransientError({ statusCode: 503, message: "down" }), true);
});

Deno.test("isTransientError -- a client error is not transient", () => {
  assertEquals(isTransientError({ statusCode: 400, message: "bad" }), false);
  assertEquals(isTransientError({ statusCode: 401, message: "no key" }), false);
  assertEquals(isTransientError({ statusCode: 422, message: "nope" }), false);
});

Deno.test("isTransientError -- the response error code decides", () => {
  assertEquals(isTransientError(failed(ResponseErrorCode.ServerError)), true);
  assertEquals(
    isTransientError(failed(ResponseErrorCode.RateLimitExceeded)),
    true,
  );
  assertEquals(
    isTransientError(failed(ResponseErrorCode.VectorStoreTimeout)),
    true,
  );
  assertEquals(
    isTransientError(failed(ResponseErrorCode.InvalidPrompt)),
    false,
  );
  assertEquals(isTransientError(failed(ResponseErrorCode.BioPolicy)), false);
});

Deno.test("isTransientError -- canonical OpenRouter error types are transient", () => {
  assertEquals(isTransientError(failed(ApiErrorType.ProviderOverloaded)), true);
  assertEquals(
    isTransientError(failed(ApiErrorType.ProviderUnavailable)),
    true,
  );
  assertEquals(isTransientError(failed(ApiErrorType.Server)), true);
  assertEquals(isTransientError(failed(ApiErrorType.Timeout)), true);
});

Deno.test("isTransientError -- a dropped connection is transient", () => {
  assertEquals(isTransientError(new Error("fetch failed")), true);
  assertEquals(isTransientError(new Error("socket hang up")), true);
  assertEquals(isTransientError(new Error("read ECONNRESET")), true);
});

Deno.test("isTransientError -- a schema failure is not transient", () => {
  const err = new SyntaxError("Unexpected token o in JSON");
  assertEquals(isTransientError(err), false);
});

Deno.test("isTransientError -- an unrelated stream code is not transient", () => {
  const err = new Error(
    'Response failed: {"code":"invalid_request","message":"bad"}',
  );
  assertEquals(isTransientError(err), false);
});

Deno.test("isTransientError -- a non-JSON payload is not read as a code", () => {
  assertEquals(isTransientError(new Error("Response failed: {oops")), false);
});

Deno.test("isTransientError -- a code elsewhere in the message is not one of ours", () => {
  // The message contains a brace and a server_error code but no SDK prefix,
  // so it must not be read as a response failure.
  const err = new SyntaxError(
    'Unexpected token in JSON {"code":"server_error"}',
  );
  assertEquals(isTransientError(err), false);
});

Deno.test("isTransientError -- a non-object value is not transient", () => {
  assertEquals(isTransientError("just a string"), false);
  assertEquals(isTransientError(undefined), false);
  assertEquals(isTransientError(null), false);
});
