// Home's client entry: a script target of the SSR document, imported by nothing.
import { boot } from "#/client/boot.tsx";
import type { HomePageData } from "#/pages/home/data.ts";
import createModels, { HomeModelsProvider } from "#/pages/home/models.ts";
import Page from "#/pages/home/page.tsx";

void boot((data: HomePageData) => (
  <HomeModelsProvider value={createModels(data)}>
    <Page />
  </HomeModelsProvider>
));
