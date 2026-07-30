import { useSignal } from "@preact/signals";
import { BriefcaseBusiness, ChevronDown, Plus } from "lucide-preact";
import Dropdown from "@/components/Dropdown.tsx";
import MenuItem from "@/components/MenuItem.tsx";
import MenuList from "@/components/MenuList.tsx";
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
          <MenuList>
            {list.value.length === 0 && (
              <li class="pointer-events-none">
                <span class="text-base-content/50">No projects yet</span>
              </li>
            )}
            {list.value.map((w) => (
              <MenuItem
                key={w.id}
                selected={w.id === currentWorkspaceId.value}
                onClick={() => {
                  select(w.id);
                  close();
                }}
              >
                {w.name}
              </MenuItem>
            ))}
            <li aria-hidden="true">
              <div class="menu-divider" />
            </li>
            <MenuItem
              onClick={() => {
                close();
                dialogOpen.value = true;
              }}
            >
              <Plus size={16} />
              New project
            </MenuItem>
          </MenuList>
        )}
      </Dropdown>
      <CreateWorkspaceDialog open={dialogOpen} />
    </>
  );
}
