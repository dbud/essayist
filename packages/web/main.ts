import { App, staticFiles } from "fresh";

export const app = new App()
  .use(staticFiles());

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
