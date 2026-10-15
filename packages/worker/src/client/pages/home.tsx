// Home's client entry: a script target of the SSR document, imported by nothing.
import { boot } from "#/client/boot.ts";
import { createHomeModels } from "#/routes/home/models.ts";
import { HomeTree } from "#/routes/home/page.tsx";

void boot({ models: createHomeModels, tree: HomeTree });
