import { computed, createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/asyncState.ts";
import { getJson, postJson } from "#/models/http.ts";
import { showToast } from "#/models/toast.ts";
import type { VotesData } from "./votes.data";

export type { VotesData };

export const VotesModel = createModel((data: VotesData) => {
  const count = signal(data.count);
  const chaosArmed = signal(false);
  const summary = computed(() =>
    count.value === 0
      ? "no votes yet"
      : count.value === 1
        ? "one vote"
        : `${count.value} votes`,
  );

  const [runFetch, { loading: refreshing, error: refreshError }] =
    createAsyncState();

  async function refresh(): Promise<void> {
    await runFetch(async () => {
      apply(await getJson<VotesData>("/api/votes"));
    });
  }

  const [runMutate, { loading: mutating, error: mutateError }] =
    createAsyncState();

  async function mutate(path: string): Promise<void> {
    const result = await runMutate(async () => {
      apply(await postJson<VotesData>(path));
      return true as const;
    });
    if (result === undefined && mutateError.value) {
      showToast(mutateError.value, "error");
    }
  }

  async function inc(): Promise<void> {
    await mutate("/api/votes/increment");
  }

  async function dec(): Promise<void> {
    await mutate("/api/votes/decrement");
  }

  // Dev-only gadget: arms a failure in the votes service, so error
  // plumbing can be exercised from the page. Ops fail until disarmed.
  async function chaos(): Promise<void> {
    const res = await postJson<{ armed: boolean }>("/api/votes/chaos");
    chaosArmed.value = res.armed;
  }

  function apply(data: VotesData): void {
    count.value = data.count;
  }

  return {
    count,
    summary,
    chaosArmed,
    refresh,
    refreshing,
    refreshError,
    mutating,
    mutateError,
    inc,
    dec,
    chaos,
  };
});

export type Votes = InstanceType<typeof VotesModel>;
