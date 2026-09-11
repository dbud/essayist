import { define } from "@/define.ts";
import { categoriesLoader } from "@/signals/categories.server.ts";

export const handler = {
  GET: define.handlers(async () => {
    return Response.json(await categoriesLoader());
  }),
};
