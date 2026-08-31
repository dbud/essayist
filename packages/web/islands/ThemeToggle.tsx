import { Moon, Sun } from "lucide-preact";
import Swappable from "@/components/ui/Swappable.tsx";
import { theme, toggleTheme } from "@/signals/preferences.ts";

/** Two-state theme toggle: three states in the model, two in the UI.
    Shows the resolved scheme; the next press either pins the opposite
    value or reverts to the system default (dropping the override). */
export default function ThemeToggle() {
  const dark = theme.value === "dark";
  return (
    <button
      type="button"
      class="btn"
      aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
      data-tooltip="Switch theme"
      onClick={toggleTheme}
    >
      <Swappable swapKey={String(dark)} class="swap-rotate">
        {dark ? <Moon size={16} /> : <Sun size={16} />}
      </Swappable>
    </button>
  );
}
