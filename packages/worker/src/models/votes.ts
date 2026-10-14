import { computed, createModel, signal } from "@preact/signals";
import { postJson } from "@/models/http";
import type { VotesData } from "./votes.data";

export type { VotesData };

export const VotesModel = createModel((data: VotesData) => {
  const count = signal(data.count);
  const summary = computed(() =>
    count.value === 0
      ? "no votes yet"
      : count.value === 1
        ? "one vote"
        : `${count.value} votes`,
  );

  async function inc(): Promise<void> {
    apply(await postJson<VotesData>("/api/votes/increment"));
  }

  async function dec(): Promise<void> {
    apply(await postJson<VotesData>("/api/votes/decrement"));
  }

  function apply(data: VotesData): void {
    count.value = data.count;
  }

  return { count, summary, inc, dec };
});

export type Votes = InstanceType<typeof VotesModel>;
