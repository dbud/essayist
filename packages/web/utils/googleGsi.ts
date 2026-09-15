// Google Identity Services (GIS) client loader.

import { loadScript } from "@/utils/loadScript.ts";

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<void> {
  return loadScript(
    GSI_SRC,
    () => typeof google !== "undefined" && !!google.accounts?.id,
  );
}

export { loadGsi };
