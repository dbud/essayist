import { useEffect, useRef } from "preact/hooks";

/** Toggle overflow:visible on the clip after open transitions settle, and
 *  on mount if already open. Clear it on close so content clips during the
 *  collapse animation. */
export function usePaneClip(
  open: boolean,
  transitionProp: "grid-template-rows" | "grid-template-columns",
  onSettled?: () => void,
) {
  const clipRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const isFirstRender = useRef(true);

  useEffect(() => {
    const clip = clipRef.current;
    if (!clip) return;

    if (isFirstRender.current) {
      if (open) clip.style.overflow = "visible";
      isFirstRender.current = false;
      return;
    }

    if (!open) clip.style.overflow = "";
  }, [open]);

  const onTransitionEnd = (e: TransitionEvent) => {
    const clip = clipRef.current;
    if (!clip) return;
    if (e.target !== clip.parentElement) return;
    if (e.propertyName !== transitionProp) return;
    if (openRef.current) clip.style.overflow = "visible";
    onSettled?.();
  };

  return { clipRef, onTransitionEnd };
}
