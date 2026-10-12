import { fromStep } from "@/flow/bridge.ts";
import type { NodeRunner } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";

export function createSourceRunner(
  pinned: PinnedVFS,
): NodeRunner<ReviewTypes, "source"> {
  return {
    execute: (_, { artifact }) =>
      fromStep(async () => {
        const { content } = await pinned.read(pinned.path, { numbered: true });
        return [artifact("content", content)];
      }),
  };
}
