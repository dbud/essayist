import { boot } from "#/client/boot.tsx";
import type { LoginData } from "#/pages/login/data.ts";
import Page from "#/pages/login/page.tsx";

void boot((data: LoginData) => <Page googleClientId={data.googleClientId} next={data.next} />);
