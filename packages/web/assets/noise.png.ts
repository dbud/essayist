import type { AssetGenerator } from "@/vite/asset-generate.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const generate: AssetGenerator = (params: Record<string, string>) => {
  const w = Number(params.w) || 64;
  const h = Number(params.h) || 64;
  const seed = Number(params.seed) || 7;
  const alpha = Number(params.alpha) ?? 128;
  const min = Number(params.min) || 0;

  const rng = mulberry32(seed);
  const data = new Uint8Array(w * h * 4);

  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(min + rng() * (255 - min));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = alpha;
  }

  return { width: w, height: h, data };
};

export default generate;
