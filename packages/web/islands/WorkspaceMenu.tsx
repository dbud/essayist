import { useSignal } from "@preact/signals";
import { BriefcaseBusiness, ChevronDown, Plus } from "lucide-preact";
import Dropdown from "@/components/Dropdown.tsx";
import CreateWorkspaceDialog from "@/islands/CreateWorkspaceDialog.tsx";
import { workspaces } from "@/signals/workspace.ts";

export default function WorkspaceMenu() {
  const dialogOpen = useSignal(false);
  const { list, current, currentWorkspaceId, select, loading } = workspaces;

  if (loading.value) {
    return (
      <button type="button" class="btn btn-sm btn-ghost gap-2" disabled>
        <span class="loading loading-spinner loading-sm" />
        <span>Loading…</span>
      </button>
    );
  }

  const label = current.value?.name ?? "Select project";

  return (
    <>
      <Dropdown
        buttonClass="btn btn-sm btn-ghost gap-2 max-w-[14rem]"
        dropdownClass="dropdown-start"
        button={
          <>
            <BriefcaseBusiness size={16} />
            <span class="truncate">{label}</span>
            <ChevronDown size={14} />
          </>
        }
      >
        {(close) => (
          <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-60 p-2 shadow-sm">
            {list.value.length === 0 && (
              <li class="pointer-events-none">
                <span class="text-base-content/50">No projects yet</span>
              </li>
            )}
            {list.value.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  class={`gap-2 ${
                    w.id === currentWorkspaceId.value
                      ? "bg-primary/10 text-primary rounded"
                      : ""
                  }`}
                  onClick={() => {
                    select(w.id);
                    close();
                  }}
                >
                  {w.name}
                </button>
              </li>
            ))}
            <li class="border-t border-base-300 mt-2 pt-2">
              <button
                type="button"
                class="gap-2"
                onClick={() => {
                  close();
                  dialogOpen.value = true;
                }}
              >
                <Plus size={16} />
                New project
              </button>
            </li>
          </ul>
        )}
      </Dropdown>
      <CreateWorkspaceDialog open={dialogOpen} />
    </>
  );
}
