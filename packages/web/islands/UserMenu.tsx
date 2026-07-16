import type { User } from "@essayist/core";
import { LogOut, RotateCcw, User as UserIcon } from "lucide-preact";
import Dropdown from "@/components/Dropdown.tsx";

interface UserMenuProps {
  user: User;
}

/**
 * Navbar account menu: a single icon trigger opening a dropdown with the
 * signed-in user's email, a clear-cache action, and a sign-out link. Lives in
 * the navbar only when a user is resolved (see routes/_app.tsx).
 */
export default function UserMenu({ user }: UserMenuProps) {
  const clearCache = () => {
    localStorage.clear();
    location.reload();
  };

  return (
    <Dropdown
      buttonClass="btn btn-ghost btn-circle"
      dropdownClass="dropdown-end"
      button={<UserIcon size={18} />}
    >
      {(close) => (
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-56 p-2 shadow-sm">
          <li class="pointer-events-none px-2 py-1 truncate text-sm text-base-content/60">
            {user.email}
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
