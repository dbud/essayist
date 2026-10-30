import type { User } from "@essayist/core";
import {
  ChevronDown,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Settings2,
  SlidersVertical,
} from "lucide-preact";

import Avatar from "#/components/Avatar.tsx";
import AutoSaveIntervalSelect from "#/components/settings/AutoSaveIntervalSelect.tsx";
import FontAxisSelect, {
  type FontAxis,
  SANS_FONT_OPTIONS,
  SERIF_FONT_OPTIONS,
} from "#/components/settings/FontAxisSelect.tsx";
import MarkStyleSelect from "#/components/settings/MarkStyleSelect.tsx";
import Dropdown, { DropdownItem, DropdownMenu } from "#/components/ui/Dropdown.tsx";
import { CheckboxIcon } from "#/components/ui/icons.tsx";
import Panel from "#/components/ui/Panel.tsx";
import { usePreferences } from "#/models/preferences.ts";
import { autoSave } from "#/signals/preferences.ts";
import { clearPreferencesCookie } from "#/utils/preferencesCookie.ts";

interface SettingsMenuProps {
  user: User;
}

export default function SettingsMenu({ user }: SettingsMenuProps) {
  const { debugSidebarOpened, sansFont, serifFont } = usePreferences();
  const sansAxis: FontAxis = { signal: sansFont, options: SANS_FONT_OPTIONS };
  const serifAxis: FontAxis = {
    signal: serifFont,
    options: SERIF_FONT_OPTIONS,
  };
  return (
    <Dropdown
      triggerClass="btn"
      trigger={
        <>
          <Settings2 size={14} />
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
              <FontAxisSelect axis={sansAxis} name="sans-font" label="Interface font" />
              <FontAxisSelect axis={serifAxis} name="serif-font" label="Serif font" />
              <MarkStyleSelect />
            </div>
          </li>
          <li class="flex w-full flex-col">
            <button
              type="button"
              class="dropdown-item"
              onClick={() => (autoSave.value = !autoSave.value)}
            >
              <CheckboxIcon selected={autoSave.value} size={15} />
              Autosave {autoSave.value ? "on" : "off"}
            </button>
            <Panel open={autoSave.value}>
              <div class="h-px bg-stroke" />
              <AutoSaveIntervalSelect />
            </Panel>
          </li>
          <DropdownItem
            onClick={() => {
              debugSidebarOpened.value = !debugSidebarOpened.value;
              close();
            }}
          >
            {debugSidebarOpened.value ? (
              <PanelRightClose size={14} />
            ) : (
              <PanelRightOpen size={14} />
            )}
            {debugSidebarOpened.value ? "Hide debug sidebar" : "Show debug sidebar"}
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
              clearPreferencesCookie(new URL(location.href));
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
