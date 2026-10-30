import type { AdminConfigData } from "#/models/admin.data.ts";
import { AdminConfigModel } from "#/models/admin.ts";
import { createModelContext } from "#/models/utils/context.ts";

export default function createModels(data: AdminConfigData) {
  return { admin: new AdminConfigModel(data) };
}

export type AdminModels = ReturnType<typeof createModels>;

export const { Provider: AdminModelsProvider, use: useAdminModels } =
  createModelContext<AdminModels>("AdminModels");
