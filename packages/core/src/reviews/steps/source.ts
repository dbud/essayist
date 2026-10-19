import { Effect } from "effect";
import { Files } from "#/files/service.ts";
import type { NodeRunner } from "#/flow/types.ts";
import type { ReviewTypes } from "#/reviews/graph.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

export const sourceRunner: NodeRunner<
  ReviewTypes,
  "source",
  Files | WorkspaceId
> = {
  execute: ({ path, versionId }, { artifact }) =>
    Effect.gen(function* () {
      const files = yield* Files;
      const snapshot = yield* files.read(path, versionId);
      const numbered = snapshot.content
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(6)}: ${line}`)
        .join("\n");
      return [artifact("content", numbered)];
    }),
};
