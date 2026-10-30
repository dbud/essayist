export function isApplePlatform() {
  return !import.meta.env.SSR && /Mac|iPhone|iPad/.test(navigator.platform);
}

export const META_KEY = isApplePlatform() ? "⌘" : "ctrl";
