/**
 * The stub agent-call layer: answers every structured call instantly with a fixed output keyed by
 * the schema's top-level fields, so the review machinery runs end to end without a model provider.
 */

import { type ModelCallRecord, ModelClient, StructuredParseError } from "@essayist/core";
import { Effect, Result, Schema } from "effect";

const STUB_SUMMARY = "Stub run: the model layer answers instantly, so nothing here is a review.";

function stubOutputOf(schema: Schema.Constraint): unknown {
  const ast = schema.ast;
  if (ast._tag !== "Objects") {
    return undefined;
  }
  const fields = new Set(ast.propertySignatures.map((property) => property.name as string));
  if (fields.has("marks")) {
    return { marks: [] };
  }
  if (fields.has("summary")) {
    return { summary: STUB_SUMMARY };
  }
  return { claims: [], outline: [], strengths: [], risks: [] };
}

export const stubModelClient = ModelClient.of({
  callModelStructured: (input, schema, _models, options) =>
    Effect.gen(function* () {
      if (options?.onPrompt) yield* options.onPrompt(input);
      const call: ModelCallRecord = { model: "stub", durationMs: 0 };
      if (options?.onModelCall) yield* options.onModelCall(call);
      const reply = stubOutputOf(schema);
      const parsed = Schema.decodeUnknownResult(schema)(reply);
      if (Result.isFailure(parsed)) {
        return yield* Effect.fail(
          new StructuredParseError({ raw: JSON.stringify(reply), detail: parsed.failure.message }),
        );
      }
      return parsed.success;
    }),
});
