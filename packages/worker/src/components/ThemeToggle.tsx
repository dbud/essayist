import { Moon, Sun } from "lucide-preact";

import Melt from "#/components/ui/Melt.tsx";
import Swap from "#/components/ui/Swap.tsx";
import { useBooting } from "#/hooks/useBooting.ts";
import { usePreferences } from "#/models/preferences.ts";

/** Two-state theme toggle: three states in the model, two in the UI.
    Shows the resolved scheme; the next press either pins the opposite
    value or reverts to the system default (dropping the override). */
export default function ThemeToggle() {
  const { theme, themeOverride, toggleTheme } = usePreferences();
  const booting = useBooting();
  // The server cannot know the system scheme: it renders the pinned theme, or light when there is
  // none. The first client render has to match it.
  const dark = booting.value ? themeOverride.value === "dark" : theme.value === "dark";
  return (
    <Melt>
      <Swap on={String(dark)}>
        <button
          type="button"
          class="btn"
          aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
          data-tooltip="Switch theme"
          onClick={toggleTheme}
        >
          {dark ? <Moon class="swap--rotate" /> : <Sun class="swap--rotate" />}
        </button>
      </Swap>
    </Melt>
  );
}
