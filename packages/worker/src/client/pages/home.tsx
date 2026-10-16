import { boot } from "#/client/boot.ts";
import createModels from "#/pages/home/models.ts";
import page from "#/pages/home/page.tsx";

void boot({ models: createModels, tree: page });
