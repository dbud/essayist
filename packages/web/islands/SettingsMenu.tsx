import type { User } from "@essayist/core";
import {
  ChevronDown,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Settings,
  SlidersVertical,
} from "lucide-preact";
import Avatar from "@/components/Avatar.tsx";
import AppFontSelect from "@/components/ui/AppFontSelect.tsx";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import MarkStyleSelect from "@/components/ui/MarkStyleSelect.tsx";
import { rightSidebarOpened } from "@/signals/sidebar.ts";

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
          <span class="hidden @lg:inline">Settings</span>
          <ChevronDown size={14} class="hidden @sm:inline rotate-on-open" />
        </>
      }
    >
      {(close) => (
        <DropdownMenu end data-stagger-children>
          <li class="dropdown-item pointer-events-none flex gap-1 p-0">
            <span class="grid h-10 w-10">
              <Avatar user={user} />
            </span>
            <div class="flex flex-col min-w-0 pt-1 pr-12">
              <div class="truncate">{user.name ?? user.email}</div>
            </div>
          </li>
          <li class="flex w-full">
            <div class="form-grid w-full">
              <AppFontSelect />
              <MarkStyleSelect />
            </div>
          </li>
          <DropdownItem
            onClick={() => {
              rightSidebarOpened.value = !rightSidebarOpened.value;
              close();
            }}
          >
            {rightSidebarOpened.value ? (
              <PanelRightClose size={14} />
            ) : (
              <PanelRightOpen size={14} />
            )}
            {rightSidebarOpened.value ? "Hide sidebar" : "Show sidebar"}
          </DropdownItem>
          {user.role === "admin" && (
            <DropdownItem href="/admin" onClick={close}>
              <SlidersVertical size={14} />
              Control panel
            </DropdownItem>
          )}
          <DropdownItem
            onClick={() => {
              localStorage.clear();
              location.reload();
              close();
            }}
          >
            <RotateCcw size={14} />
            Clear cache
          </DropdownItem>
          <DropdownItem href="/oauth/signout" onClick={close}>
            <LogOut size={14} />
            Sign out
          </DropdownItem>
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
