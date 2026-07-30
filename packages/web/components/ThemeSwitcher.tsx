import { type LucideIcon, Monitor, Moon, Sun } from "lucide-preact";
import { theme } from "@/signals/preferences.ts";
import { THEMES, type ThemePref } from "@/signals/theme.ts";

const THEME_META: Record<ThemePref, { label: string; icon: LucideIcon }> = {
  auto: { label: "Auto", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

export default function ThemeSwitcher() {
  return (
    <div role="tablist" class="tabs tabs-box tabs-sm w-full">
      {THEMES.map((pref) => {
        const meta = THEME_META[pref];
        const Icon = meta.icon;
        const active = theme.value === pref;
        return (
          <label class="tab flex-1 gap-1">
            <input
              type="radio"
              name="theme"
              class="hidden"
              checked={active}
              onChange={() => {
                theme.value = pref;
              }}
            />
            <Icon size={14} />
            <span>{meta.label}</span>
          </label>
        );
      })}
    </div>
  );
}
