import { IS_BROWSER } from "fresh/runtime";

export function isApplePlatform() {
  return IS_BROWSER && /Mac|iPhone|iPad/.test(navigator.platform);
}

export const META_KEY = isApplePlatform() ? "⌘" : "Ctrl";
