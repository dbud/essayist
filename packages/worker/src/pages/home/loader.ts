import {
  type Category,
  type PersistenceError,
  ReviewConfig,
} from "@essayist/core";
import { DateTime, Effect } from "effect";
import type { PageInfoData } from "#/models/pageInfo.ts";
import type { VotesData } from "#/models/votes.ts";
import { Votes } from "#/votes/service.ts";
import type { HomePageData } from "./data";

const loader: Effect.Effect<
  HomePageData,
  PersistenceError,
  Votes | ReviewConfig
> = Effect.gen(function* () {
  const now = yield* DateTime.now;
  const count = yield* Votes.use((store) => store.get());
  const categories: Category[] = yield* ReviewConfig.use((store) =>
    store.listCategories(),
  );

  const pageInfo: PageInfoData = {
    message: "Worker runtime prototype: hono + preact SSR",
    renderedAt: DateTime.formatIso(now),
  };
  const votes: VotesData = { count };
  return { pageInfo, votes, categories };
});

export default loader;
