import type { Category, ModelPool, Prompt } from "@essayist/core";

export type DialogRequest =
  | { kind: "pool"; entity?: ModelPool }
  | { kind: "prompt"; entity?: Prompt }
  | { kind: "category"; entity?: Category };
