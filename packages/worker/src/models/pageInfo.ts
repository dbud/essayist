import { createModel, signal } from "@preact/signals";
import type { PageInfoData } from "./pageInfo.data";

export type { PageInfoData };

export const PageInfoModel = createModel((data: PageInfoData) => {
  const message = signal(data.message);
  const renderedAt = signal(data.renderedAt);
  return { message, renderedAt };
});

export type PageInfo = InstanceType<typeof PageInfoModel>;
