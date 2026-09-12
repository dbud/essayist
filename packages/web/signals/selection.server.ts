import { registerLoader } from "@/signals/models.server.ts";
import { selectedFileNs } from "@/signals/selection.ts";
import { userStateStore } from "@/store.ts";

registerLoader(
  selectedFileNs,
  async (workspaceId, { user }) =>
    (await userStateStore.getSelectedFile(user.id, String(workspaceId))) ??
    null,
);
