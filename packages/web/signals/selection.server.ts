import { registerLoader } from "@/signals/models.server.ts";
import { selectedFileNs, selectedWorkspaceNs } from "@/signals/selection.ts";
import { userStateStore } from "@/store.ts";

registerLoader(
  selectedWorkspaceNs,
  async (_key, user) =>
    (await userStateStore.getSelectedWorkspace(user.id)) ?? null,
);

registerLoader(
  selectedFileNs,
  async (workspaceId, user) =>
    (await userStateStore.getSelectedFile(user.id, String(workspaceId))) ??
    null,
);
