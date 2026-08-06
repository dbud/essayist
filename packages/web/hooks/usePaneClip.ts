import { useEffect, useRef } from "preact/hooks";

/** After the pane open-transition settles, set overflow:visible on the
 *  clip element so dropdowns can escape. Clear it immediately when open
 *  becomes false so content is clipped during the close animation. */
export function usePaneClip(
  open: boolean,
  transitionProp: "grid-template-rows" | "grid-template-columns",
) {
  const clipRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const clip = clipRef.current;
    if (!clip) return;
    if (!open) clip.style.overflow = "";
  }, [open]);

  const onTransitionEnd = (e: TransitionEvent) => {
    const clip = clipRef.current;
    if (!clip) return;
    if (e.target !== clip.parentElement) return;
    if (e.propertyName !== transitionProp) return;
    if (openRef.current) clip.style.overflow = "visible";
  };

  return { clipRef, onTransitionEnd };
}
