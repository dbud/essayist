import type { User } from "@essayist/core";
import { ChevronDown, LogOut, RotateCcw, Settings } from "lucide-preact";
import Avatar from "@/components/Avatar.tsx";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";

interface SettingsMenuProps {
  user: User;
}

export default function SettingsMenu({ user }: SettingsMenuProps) {
  return (
    <Dropdown
      triggerClass="btn"
      trigger={
        <>
          <Settings size={16} />
          Settings
          <ChevronDown size={14} />
        </>
      }
    >
      {(close) => (
        <DropdownMenu end>
          <li class="dropdown-item pointer-events-none flex gap-3">
            <span class="grid h-8 w-8">
              <Avatar user={user} />
            </span>
            <div class="flex flex-col min-w-0">
              <div class="truncate text-md font-medium">
                {user.name ?? user.email}
              </div>
              <div class="truncate text-xs text-pane-content/80 tracking-wide font-normal">
                {user.email}
              </div>
            </div>
          </li>
          <DropdownItem
            onClick={() => {
              localStorage.clear();
              location.reload();
              close();
            }}
          >
            <RotateCcw size={16} />
            Clear cache
          </DropdownItem>
          <DropdownItem onClick={close}>
            <a href="/oauth/signout" class="flex items-center gap-2">
              <LogOut size={16} />
              Sign out
            </a>
          </DropdownItem>
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
