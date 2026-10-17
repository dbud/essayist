// The page map: app/hono.ts mounts each subapp at its entry path.
import editor from "./editor/route.tsx";
import home from "./home/route.tsx";
import login from "./login/route.tsx";

export const pages = { "/": home, "/login": login, "/editor": editor } as const;
