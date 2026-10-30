import { boot } from "#/client/boot.tsx";
import type { AdminConfigData } from "#/models/admin.data.ts";
import createModels, { AdminModelsProvider } from "#/pages/admin/models.ts";
import Page from "#/pages/admin/page.tsx";

void boot((data: AdminConfigData) => (
  <AdminModelsProvider value={createModels(data)}>
    <Page />
  </AdminModelsProvider>
));
