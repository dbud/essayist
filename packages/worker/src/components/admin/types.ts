import type { ModelPoolData, PromptData, ReviewPassData } from "#/models/admin.data.ts";
import type { CategoryData } from "#/models/categories.data.ts";

export type DialogRequest =
  | { kind: "pool"; entity?: ModelPoolData }
  | { kind: "prompt"; entity?: PromptData }
  | { kind: "category"; entity?: CategoryData }
  | { kind: "pass"; entity?: ReviewPassData }
  | { kind: "unit"; pass: ReviewPassData; unitId?: string };
