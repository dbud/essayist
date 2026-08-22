import { useEffect } from "preact/hooks";
import { tooltipText, tooltipX, tooltipY } from "@/signals/tooltip.ts";

export default function Tooltip() {
  useEffect(() => {
    let el: Element | null = null;

    const onOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest("[data-tooltip]");
      if (target !== el) {
        el = target;
        tooltipText.value = target?.getAttribute("data-tooltip") ?? null;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (tooltipText.value) {
        tooltipX.value = e.clientX;
        tooltipY.value = e.clientY;
      }
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);

  if (!tooltipText.value) return null;

  return (
    <div
      class="tooltip z-tooltip"
      style={{ left: tooltipX.value, top: tooltipY.value }}
    >
      {tooltipText.value}
    </div>
  );
}
