import { DateTime, Effect } from "effect";
import type { PageInfoData } from "@/models/pageInfo";
import type { VotesData } from "@/models/votes";
import type { HomePageData } from "./data";

export const homeLoader: Effect.Effect<HomePageData> = Effect.gen(function* () {
  const now = yield* DateTime.now;
  const pageInfo: PageInfoData = {
    message: "Worker runtime prototype: hono + preact SSR",
    renderedAt: DateTime.formatIso(now),
  };
  const votes: VotesData = { count: 0 };
  return { pageInfo, votes };
});
