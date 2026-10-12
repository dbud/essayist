import { Effect } from "effect";
import { Files } from "@/files/service.ts";
import type { NodeRunner } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { WorkspaceId } from "@/workspace/WorkspaceId.ts";

export const sourceRunner: NodeRunner<
  ReviewTypes,
  "source",
  Files | WorkspaceId
> = {
  execute: ({ path, versionId }, { artifact }) =>
    Effect.gen(function* () {
      const files = yield* Files;
      const snapshot = yield* files.read(path, {
        versionId,
        numbered: true,
      });
      return [artifact("content", snapshot.content)];
    }),
};
