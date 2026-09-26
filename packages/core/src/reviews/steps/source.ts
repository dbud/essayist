import type { NodeRunner } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { PinnedVFS } from "@/vfs/pin.ts";

/** Reads the pinned version; its numbered content feeds the pass. */
export function createSourceRunner(
  pinned: PinnedVFS,
): NodeRunner<ReviewTypes, "source"> {
  return {
    async execute(_, { artifact }) {
      const { content } = await pinned.read(pinned.path, { numbered: true });
      return [artifact("content", content)];
    },
  };
}
