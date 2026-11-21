import { parseColor, type Rgba } from "./color.ts";

/** A rounded box to draw, in CSS pixels relative to the frame. */
export interface MeltShape {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly radius: number;
  /** The fill, with the opacity of the element and of its ancestors in the alpha. */
  readonly color: Rgba;
  /** How many shapes contain this one. Shapes merge only with shapes on the same layer. */
  readonly layer: number;
}

/** The area to draw, in CSS pixels relative to the border box of the root. */
export interface MeltFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** sigma is how far the field of a shape spreads. The outline opacity is field * gain + bias. */
  readonly sigma: number;
  readonly gain: number;
  readonly bias: number;
  /** Sorted by layer. */
  readonly shapes: readonly MeltShape[];
}

const DEFAULTS = { sigma: 6, gain: 18, bias: -6 };
// The field of a shape fades out within three sigma.
const FIELD_SIGMAS = 3;

/** Reads the shapes under a group root: the elements with a visible --melt-fill. */
export function readFrame(root: HTMLElement): MeltFrame | null {
  const rootRect = root.getBoundingClientRect();
  const rootStyle = getComputedStyle(root);
  const setting = (name: keyof typeof DEFAULTS) => {
    const value = parseFloat(rootStyle.getPropertyValue(`--melt-${name}`));
    return Number.isFinite(value) ? value : DEFAULTS[name];
  };
  const sigma = setting("sigma");

  const opacities = new Map<Element, number>([[root, 1]]);
  const layers = new Map<Element, number>();
  const found: { rect: DOMRect; radius: number; color: Rgba; layer: number }[] = [];

  // Document order visits a parent before its children.
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const opacity = (opacities.get(parent ?? root) ?? 1) * parseFloat(style.opacity);
    opacities.set(element, opacity);

    if (style.visibility === "hidden" || opacity === 0) continue;
    const fill = parseColor(style.getPropertyValue("--melt-fill"));
    if (fill[3] === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const layer = shapeLayer(element, root, layers);
    layers.set(element, layer);
    // The rect includes transforms, so the radius is scaled to match.
    const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
    const radius = parseRadius(style.borderTopLeftRadius, rect.width) * scale;
    found.push({ rect, radius, color: [fill[0], fill[1], fill[2], fill[3] * opacity], layer });
  }
  if (found.length === 0) return null;

  const margin = sigma * FIELD_SIGMAS;
  const left = Math.min(...found.map(({ rect }) => rect.left)) - margin;
  const top = Math.min(...found.map(({ rect }) => rect.top)) - margin;
  const right = Math.max(...found.map(({ rect }) => rect.right)) + margin;
  const bottom = Math.max(...found.map(({ rect }) => rect.bottom)) + margin;

  const shapes = found
    .map(({ rect, radius, color, layer }) => ({
      x: rect.left + rect.width / 2 - left,
      y: rect.top + rect.height / 2 - top,
      halfWidth: rect.width / 2,
      halfHeight: rect.height / 2,
      radius,
      color,
      layer,
    }))
    .toSorted((a, b) => a.layer - b.layer);

  return {
    left: left - rootRect.left,
    top: top - rootRect.top,
    width: right - left,
    height: bottom - top,
    sigma,
    gain: setting("gain"),
    bias: setting("bias"),
    shapes,
  };
}

function shapeLayer(element: Element, root: Element, layers: Map<Element, number>): number {
  for (let parent = element.parentElement; parent && parent !== root;) {
    const layer = layers.get(parent);
    if (layer !== undefined) return layer + 1;
    parent = parent.parentElement;
  }
  return 0;
}

function parseRadius(value: string, width: number): number {
  const radius = parseFloat(value);
  if (!Number.isFinite(radius)) return 0;
  return value.trim().endsWith("%") ? (radius / 100) * width : radius;
}
