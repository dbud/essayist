import type { User } from "@essayist/core";
import { useSignal } from "@preact/signals";
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
import FontAxisSelect, {
  SANS_FONT_OPTIONS,
  SERIF_FONT_OPTIONS,
} from "#/components/settings/FontAxisSelect.tsx";
import MarkStyleSelect from "#/components/settings/MarkStyleSelect.tsx";
import AqCollapse from "#/components/ui/AqCollapse.tsx";
import AqSegmented from "#/components/ui/AqSegmented.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { AUTO_SAVE_INTERVAL_VALUES } from "#/models/preferences.ts";
import { usePreferences } from "#/models/preferences.ts";
import { clearPreferencesCookie } from "#/utils/preferencesCookie.ts";

interface SettingsMenuProps {
  user: User;
}

const INTERVAL_OPTIONS = AUTO_SAVE_INTERVAL_VALUES.map((seconds) => ({
  value: seconds,
  label: seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`,
}));

export default function SettingsMenu({ user }: SettingsMenuProps) {
  const { debugSidebarOpened, sansFont, serifFont, autoSave, autoSaveInterval } = usePreferences();
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);
  const sansAxis = { signal: sansFont, options: SANS_FONT_OPTIONS };
  const serifAxis = {
    signal: serifFont,
    options: SERIF_FONT_OPTIONS,
  };
  return (
    <div class="aq-melt inline-flex" ref={ref}>
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <Settings2 />
        <span class="hidden @lg:inline">Settings</span>
        <ChevronDown class="hidden @sm:inline aq-chevron" />
      </button>
      <div class={`aq-dropdown--origin-end aq-dropdown--detached ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            <li class="pointer-events-none flex gap-1">
              <span class="grid h-10 w-10">
                <Avatar user={user} />
              </span>
              <div class="flex flex-col min-w-0 pt-1 pr-12">
                <div class="truncate">{user.name ?? user.email}</div>
              </div>
            </li>
            <li class="flex flex-col min-w-52">
              <button
                type="button"
                role="switch"
                aria-checked={autoSave.value}
                class={`aq-menu-btn aq-toggle-row ${autoSave.value ? "is-on" : ""}`}
                onClick={() => (autoSave.value = !autoSave.value)}
              >
                <span>Autosave</span>
              </button>
              <AqCollapse open={autoSave.value} fade>
                <AqSegmented
                  value={autoSaveInterval}
                  options={INTERVAL_OPTIONS}
                  label="Autosave interval"
                  class="mt-2"
                />
              </AqCollapse>
            </li>
            <li>
              <button
                type="button"
                class="aq-menu-btn"
                onClick={() => {
                  debugSidebarOpened.value = !debugSidebarOpened.value;
                  close();
                }}
              >
                {debugSidebarOpened.value ? <PanelRightClose /> : <PanelRightOpen />}
                {debugSidebarOpened.value ? "Hide debug sidebar" : "Show debug sidebar"}
              </button>
            </li>
            {user.role === "admin" && (
              <li>
                <a href="/admin" class="aq-menu-btn" onClick={close}>
                  <SlidersVertical />
                  Control panel
                </a>
              </li>
            )}
            <li>
              <button
                type="button"
                class="aq-menu-btn"
                onClick={() => {
                  localStorage.clear();
                  clearPreferencesCookie(new URL(location.href));
                  location.reload();
                  close();
                }}
              >
                <RotateCcw />
                Clear cache
              </button>
            </li>
            <li>
              <a href="/oauth/signout" class="aq-menu-btn" onClick={close}>
                <LogOut />
                Sign out
              </a>
            </li>
          </ul>
        </div>
        <FontAxisSelect axis={sansAxis} label="Interface font" />
        <FontAxisSelect axis={serifAxis} label="Serif font" />
        <MarkStyleSelect />
      </div>
    </div>
  );
}
