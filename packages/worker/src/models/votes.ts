import { computed, createModel, signal } from "@preact/signals";
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

  function inc(): void {
    count.value += 1;
  }

  function dec(): void {
    count.value -= 1;
  }

  return { count, summary, inc, dec };
});

export type Votes = InstanceType<typeof VotesModel>;
