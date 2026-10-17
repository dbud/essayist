// The page map: app/hono.ts mounts each subapp at its entry path.
import home from "./home/route.tsx";
import login from "./login/route.tsx";

export const pages = { "/": home, "/login": login } as const;
