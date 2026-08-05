import type { User } from "@essayist/core";
import { LogOut, RotateCcw } from "lucide-preact";
import Avatar from "@/components/Avatar.tsx";
import Dropdown from "@/components/Dropdown.tsx";

interface UserMenuProps {
  user: User;
}

function ClearCacheButton({ close }: { close: () => void }) {
  return (
    <button
      type="button"
      class="gap-2 py-1"
      onClick={() => {
        localStorage.clear();
        location.reload();
        close();
      }}
    >
      <RotateCcw size={16} />
      Clear cache
    </button>
  );
}

function SignOutButton() {
  return (
    <a href="/oauth/signout" class="gap-2 py-1">
      <LogOut size={16} />
      Sign out
    </a>
  );
}

export default function UserMenu({ user }: UserMenuProps) {
  return (
    <Dropdown
      buttonClass="btn btn-ghost btn-circle p-0 overflow-hidden"
      dropdownClass="dropdown-end"
      button={<Avatar user={user} />}
    >
      {(close) => (
        <div class="dropdown-content bg-base-100 rounded-box z-1 w-64 p-2 shadow-sm flex flex-col gap-1">
          <div class="flex flex-col items-start px-2 py-2">
            <div class="truncate text-sm font-medium">
              {user.name ?? user.email}
            </div>
            <div class="truncate text-xs text-base-content/60">
              {user.email}
            </div>
          </div>
          <ul class="w-full p-0 gap-1">
            <li>
              <ClearCacheButton close={close} />
            </li>
            <li>
              <SignOutButton />
            </li>
          </ul>
        </div>
      )}
    </Dropdown>
  );
}
