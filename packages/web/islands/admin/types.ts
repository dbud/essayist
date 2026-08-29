import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";

export type DialogRequest =
  | { kind: "pool"; entity?: ModelPool }
  | { kind: "prompt"; entity?: Prompt }
  | { kind: "category"; entity?: Category }
  | { kind: "pass"; entity?: ReviewPass };
