// The page map: app/hono.ts mounts each subapp at its entry path.
import admin from "./admin/route.tsx";
import editor from "./editor/route.tsx";
import home from "./home/route.tsx";
import importGoogleDocs from "./import/googleDocs/route.tsx";
import login from "./login/route.tsx";
import reviewTrace from "./reviewTrace/route.tsx";

export const pages = {
  "/": home,
  "/login": login,
  "/admin": admin,
  "/editor": editor,
  "/import/google-docs": importGoogleDocs,
  "/traces": reviewTrace,
} as const;
