// Home's client entry: a script target of the SSR document, imported by nothing.
import { boot } from "@/client/boot";
import { createHomeModels } from "@/routes/home/models";
import { HomeTree } from "@/routes/home/page";

void boot({ models: createHomeModels, tree: HomeTree });
