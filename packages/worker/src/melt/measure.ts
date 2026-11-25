import { parseColor, type Rgba } from "./color.ts";
import type { ShapeNode } from "./discover.ts";
import type { Box, MeasuredShape, MeltEffects, Measurement } from "./layout.ts";
import { timed } from "./stats.ts";

/** The parts of a shape that only change with its computed style, so they can be kept between
    frames while nothing restyles it. */
export interface ShapeStyle {
  /** As computed, since a percentage depends on the width of the frame. */
  readonly radius: string;
  readonly fill: Rgba;
  readonly effects: MeltEffects;
  readonly visible: boolean;
}

export function readShapeStyle(element: Element): ShapeStyle {
  const style = getComputedStyle(element);
  return {
    radius: style.borderTopLeftRadius,
    fill: parseColor(style.getPropertyValue("--melt-fill")),
    effects: {
      stroke: parseColor(style.getPropertyValue("--melt-stroke")),
      strokeWidth: parseFloat(style.getPropertyValue("--melt-stroke-width")) || 0,
      rim: parseColor(style.getPropertyValue("--melt-rim")),
      shade: parseColor(style.getPropertyValue("--melt-shade")),
      glow: parseFloat(style.getPropertyValue("--melt-glow")) || 0,
      shadow: parseColor(style.getPropertyValue("--melt-shadow")),
      height: parseFloat(style.getPropertyValue("--melt-height")) || 0,
    },
    visible: style.visibility !== "hidden",
  };
}

/** Reads the current geometry and opacity of each shape, its style through styleOf, and the
    settings of the root. */
export function measure(
  root: HTMLElement,
  nodes: readonly ShapeNode[],
  styleOf: (element: HTMLElement) => ShapeStyle = readShapeStyle,
): Measurement {
  // Rects are measured in the viewport, with every transform applied. The canvas sits inside the
  // root, so the transforms of the root and its ancestors apply to it as well; dividing them out
  // leaves the CSS pixels of the root. The computed width keeps its fraction, unlike offsetWidth,
  // whose rounding would scale every position by a little and shift shapes far from the root.
  const { origin, rootStyle, layoutWidth } = timed("flush", () => {
    const style = getComputedStyle(root);
    return {
      origin: root.getBoundingClientRect(),
      rootStyle: style,
      layoutWidth: parseFloat(style.width) || root.offsetWidth,
    };
  });
  const scale = layoutWidth > 0 ? origin.width / layoutWidth : 1;
  const local = (rect: DOMRect): Box => ({
    left: (rect.left - origin.left) / scale,
    top: (rect.top - origin.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  });
  const setting = (name: string) => parseFloat(rootStyle.getPropertyValue(`--melt-${name}`));
  const opacities = new Map<Element, number>([[root, 1]]);

  // Each kind of read runs over every shape in turn, so each is timed once per frame: timers are
  // too coarse for a single read.
  const styles = timed("styles", () => nodes.map(({ element }) => styleOf(element)));
  const boxes = timed("rects", () =>
    nodes.map(({ element }) => ({
      rect: local(element.getBoundingClientRect()),
      layoutWidth: element.offsetWidth,
    })),
  );
  const opacity = timed("opacity", () => nodes.map(({ element }) => opacityOf(element, opacities)));

  const shapes = nodes.map(({ group }, i): MeasuredShape => {
    const { radius, fill, effects, visible } = styles[i];
    const { rect, layoutWidth: width } = boxes[i];
    return {
      rect,
      layoutWidth: width,
      radius: parseRadius(radius, width),
      fill,
      effects,
      opacity: opacity[i],
      visible,
      group,
    };
  });

  return {
    settings: {
      sigma: setting("sigma"),
      gain: setting("gain"),
      bias: setting("bias"),
      lightAngle: setting("light-angle"),
      lightElevation: setting("light-elevation"),
      rimWidth: setting("rim-width"),
      rimHighlight: setting("rim-highlight"),
      rimShine: setting("rim-shine"),
      rimSheen: setting("rim-sheen"),
      lightSize: setting("light-size"),
      shadowTint: setting("shadow-tint"),
      lightAmbient: setting("light-ambient"),
      grain: setting("grain"),
    },
    shapes,
  };
}

/** The opacity of an element multiplied by the opacity of its ancestors up to the root. */
function opacityOf(element: Element, known: Map<Element, number>): number {
  return known.getOrInsertComputed(element, () => {
    const parent = element.parentElement;
    const inherited = parent === null ? 1 : opacityOf(parent, known);
    return inherited * parseFloat(getComputedStyle(element).opacity);
  });
}

function parseRadius(value: string, width: number): number {
  const radius = parseFloat(value);
  if (!Number.isFinite(radius)) return 0;
  return value.trim().endsWith("%") ? (radius / 100) * width : radius;
}
