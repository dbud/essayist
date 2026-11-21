/** An sRGB colour as red, green, blue and alpha, each from 0 to 1, not premultiplied. */
export type Rgba = readonly [number, number, number, number];

const TRANSPARENT: Rgba = [0, 0, 0, 0];

// Computed colours keep their colour space, such as oklch, so a 1x1 canvas converts them to sRGB. A
// transition produces a new colour on every frame, so the cache has a size limit.
const cache = new Map<string, Rgba>();
const CACHE_LIMIT = 512;
let context: CanvasRenderingContext2D | null = null;

export function parseColor(value: string): Rgba {
  const key = value.trim();
  if (key === "" || key === "transparent") return TRANSPARENT;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  if (context === null) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return TRANSPARENT;
  }
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = "transparent";
  context.fillStyle = key;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  const color: Rgba = [r / 255, g / 255, b / 255, a / 255];

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, color);
  return color;
}
