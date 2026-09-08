import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async () => {
    return Response.json(await configStore.listCategories());
  }),
};
