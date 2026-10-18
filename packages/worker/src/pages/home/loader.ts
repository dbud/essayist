import {
  type Category,
  type PersistenceError,
  ReviewConfig,
} from "@essayist/core";
import { Effect } from "effect";
import type { HomePageData } from "./data";

const loader: Effect.Effect<HomePageData, PersistenceError, ReviewConfig> =
  Effect.gen(function* () {
    const categories: Category[] = yield* ReviewConfig.use((store) =>
      store.listCategories(),
    );
    return { categories };
  });

export default loader;
