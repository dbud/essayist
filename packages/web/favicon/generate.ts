// Generates the favicon assets from the shared logo mark
// (components/ui/logo-mark.ts):
//   static/favicon.svg           Vector, used by Chromium and Firefox.
//   static/favicon.ico           16/32/48 px, PNG-compressed entries
//   static/apple-touch-icon.png  180 px for iOS home screens.
//
// Run: deno task -f web favicon
// Drift check (CI): deno task -f web favicon:check

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { formatHex } from "culori";
import { logoMark } from "@/components/ui/logo-mark.ts";

const ICON_SCALE = 0.9;
const ICO_SIZES = [16, 32, 48];
const TOUCH_ICON_SIZE = 180;

export function toHex(color: string): string {
  const hex = formatHex(color);
  if (hex === undefined) throw new Error(`Unsupported color: ${color}`);
  return hex;
}

export function markSvg(): string {
  const { viewBox, colors } = logoMark;
  const pad = (viewBox.width * (1 - ICON_SCALE)) / 2;
  const paths = logoMark.paths.map((d) => `      <path d="${d}"/>`).join("\n");
  const line = (n: number) => String(Number(n.toFixed(3)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}">
  <rect width="${viewBox.width}" height="${viewBox.height}" fill="${toHex(
    colors.background,
  )}"/>
  <g transform="translate(${line(pad)} ${line(pad)}) scale(${ICON_SCALE}) ${logoMark.transform}">
    <g fill="none" stroke="${toHex(colors.stroke)}" stroke-width="3">
${paths}
    </g>
    <rect x="${logoMark.caret.x}" y="${logoMark.caret.y}" width="${logoMark.caret.width}" height="${logoMark.caret.height}" fill="${toHex(colors.caret)}"/>
  </g>
</svg>
`;
}

export function buildIco(
  images: { size: number; data: Uint8Array }[],
): Uint8Array {
  const count = images.length;
  const headerSize = 6 + count * 16;
  const dataSize = images.reduce((n, image) => n + image.data.length, 0);
  const buffer = new Uint8Array(headerSize + dataSize);
  const view = new DataView(buffer.buffer);
  view.setUint16(2, 1, true); // Resource type: icon.
  view.setUint16(4, count, true);
  let offset = headerSize;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    view.setUint8(entry, image.size);
    view.setUint8(entry + 1, image.size);
    view.setUint16(entry + 4, 1, true); // Color planes.
    view.setUint16(entry + 6, 32, true); // Bits per pixel.
    view.setUint32(entry + 8, image.data.length, true);
    view.setUint32(entry + 12, offset, true);
    buffer.set(image.data, offset);
    offset += image.data.length;
  }
  return buffer;
}

let wasmReady: Promise<void> | undefined;

async function rasterize(svg: string, size: number): Promise<Uint8Array> {
  wasmReady ??= initWasm(
    fetch(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm")),
  );
  await wasmReady;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  });
  const image = resvg.render();
  const png = new Uint8Array(image.asPng());
  image.free();
  resvg.free();
  return png;
}

async function buildOutputs() {
  const svg = markSvg();
  const icoImages = [];
  for (const size of ICO_SIZES) {
    icoImages.push({ size, data: await rasterize(svg, size) });
  }
  const touchIcon = await rasterize(svg, TOUCH_ICON_SIZE);
  const svgBytes = new TextEncoder().encode(svg);
  return [
    { file: "favicon.svg", data: svgBytes },
    { file: "favicon.ico", data: buildIco(icoImages) },
    { file: "apple-touch-icon.png", data: touchIcon },
  ];
}

async function sameBytes(path: URL, data: Uint8Array): Promise<boolean> {
  try {
    const current = await Deno.readFile(path);
    return (
      current.length === data.length &&
      current.every((byte, i) => byte === data[i])
    );
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const check = Deno.args.includes("--check");
  const outputs = await buildOutputs();
  if (check) {
    const stale = [];
    for (const { file, data } of outputs) {
      const path = new URL(`../static/${file}`, import.meta.url);
      if (!(await sameBytes(path, data))) stale.push(file);
    }
    if (stale.length > 0) {
      console.error(`favicon stale: ${stale.join(", ")}`);
      console.error("run: deno task -f web favicon");
      Deno.exit(1);
    }
    console.log("favicon assets up to date");
  } else {
    for (const { file, data } of outputs) {
      const path = new URL(`../static/${file}`, import.meta.url);
      await Deno.writeFile(path, data);
      console.log(`wrote static/${file} (${data.length} bytes)`);
    }
  }
}
