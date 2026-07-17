import type { User } from "@essayist/core";
import { LogOut, RotateCcw } from "lucide-preact";
import Avatar from "@/components/Avatar.tsx";
import Dropdown from "@/components/Dropdown.tsx";

interface UserMenuProps {
  user: User;
}

export default function UserMenu({ user }: UserMenuProps) {
  const clearCache = () => {
    localStorage.clear();
    location.reload();
  };

  return (
    <Dropdown
      buttonClass="btn btn-ghost btn-circle p-0 overflow-hidden"
      dropdownClass="dropdown-end"
      button={<Avatar user={user} />}
    >
      {(close) => (
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-56 p-2 shadow-sm">
          <li class="pointer-events-none">
            <div class="flex flex-col items-start px-2 py-2">
              <div class="truncate text-sm font-medium">
                {user.name ?? user.email}
              </div>
              <div class="truncate text-xs text-base-content/60">
                {user.email}
              </div>
            </div>
          </li>
          <li>
            <button
              type="button"
              class="gap-2"
              onClick={() => {
                clearCache();
                close();
              }}
            >
              <RotateCcw size={16} />
              <span>Clear cache</span>
            </button>
          </li>
          <li>
            <a href="/oauth/signout" class="gap-2">
              <LogOut size={16} />
              <span>Sign out</span>
            </a>
          </li>
        </ul>
      )}
    </Dropdown>
  );
}
