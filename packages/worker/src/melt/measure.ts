import { parseColor } from "./color.ts";
import type { ShapeNode } from "./discover.ts";
import type { Box, MeasuredShape, Measurement } from "./layout.ts";

/** Reads the current geometry, fill and opacity of each shape, and the settings of the root. */
export function measure(root: HTMLElement, nodes: readonly ShapeNode[]): Measurement {
  // Rects are measured in the viewport, with every transform applied. The canvas sits inside the
  // root, so the transforms of the root and its ancestors apply to it as well; dividing them out
  // leaves the CSS pixels of the root.
  const origin = root.getBoundingClientRect();
  const scale = root.offsetWidth > 0 ? origin.width / root.offsetWidth : 1;
  const local = (rect: DOMRect): Box => ({
    left: (rect.left - origin.left) / scale,
    top: (rect.top - origin.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  });
  const rootStyle = getComputedStyle(root);
  const setting = (name: string) => parseFloat(rootStyle.getPropertyValue(`--melt-${name}`));
  const opacities = new Map<Element, number>([[root, 1]]);

  const shapes = nodes.map(({ element, group }): MeasuredShape => {
    const style = getComputedStyle(element);
    return {
      rect: local(element.getBoundingClientRect()),
      layoutWidth: element.offsetWidth,
      radius: parseRadius(style.borderTopLeftRadius, element.offsetWidth),
      fill: parseColor(style.getPropertyValue("--melt-fill")),
      effects: {
        stroke: parseColor(style.getPropertyValue("--melt-stroke")),
        strokeWidth: parseFloat(style.getPropertyValue("--melt-stroke-width")) || 0,
        rim: parseColor(style.getPropertyValue("--melt-rim")),
        shade: parseColor(style.getPropertyValue("--melt-shade")),
        glow: parseFloat(style.getPropertyValue("--melt-glow")) || 0,
        shadow: parseColor(style.getPropertyValue("--melt-shadow")),
        shadowX: parseFloat(style.getPropertyValue("--melt-shadow-x")) || 0,
        shadowY: parseFloat(style.getPropertyValue("--melt-shadow-y")) || 0,
        shadowBlur: parseFloat(style.getPropertyValue("--melt-shadow-blur")) || 0,
      },
      opacity: opacityOf(element, opacities),
      visible: style.visibility !== "hidden",
      group,
    };
  });

  return {
    settings: { sigma: setting("sigma"), gain: setting("gain"), bias: setting("bias") },
    shapes,
  };
}

/** The opacity of an element multiplied by the opacity of its ancestors up to the root. */
function opacityOf(element: Element, known: Map<Element, number>): number {
  const cached = known.get(element);
  if (cached !== undefined) return cached;
  const parent = element.parentElement;
  const inherited = parent === null ? 1 : opacityOf(parent, known);
  const opacity = inherited * parseFloat(getComputedStyle(element).opacity);
  known.set(element, opacity);
  return opacity;
}

function parseRadius(value: string, width: number): number {
  const radius = parseFloat(value);
  if (!Number.isFinite(radius)) return 0;
  return value.trim().endsWith("%") ? (radius / 100) * width : radius;
}
