// The page map: app/hono.ts mounts the entries.
import home from "./home/route.tsx";
import login from "./login/route.tsx";

export const pages = { home, login } as const;
export type PageName = keyof typeof pages;
