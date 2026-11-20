import { boot } from "#/client/boot.tsx";
import { loadGsi } from "#/client/googleGsi.ts";
import type { LoginData } from "#/pages/login/data.ts";
import Page from "#/pages/login/page.tsx";

void boot<LoginData>(({ data }) => (
  <Page googleClientId={data.googleClientId} next={data.next} loadGsi={loadGsi} />
));
