import { useMediaQuery } from "@/hooks/useMediaQuery.ts";

const SMALL_SCREEN = "(max-width: 1023px)";

export function useSmallScreen() {
  return useMediaQuery(SMALL_SCREEN);
}
