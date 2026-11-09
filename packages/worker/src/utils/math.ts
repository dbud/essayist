export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, span: number): number => from + (to - from) * span;

const smoothstep = (span: number): number => {
  const f = clamp(span, 0, 1);
  return f * f * (3 - 2 * f);
};

/** Mulberry32: 32-bit PRNG in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 2 ** 32;
  };
};

// The golden-ratio constant, to decorrelate adjacent indices in unitHash.
const PHI = 0x9e3779b1;

/** Stateless: the same seed and index always yield the same value in [0, 1). */
export const unitHash = (seed: number, index: number): number =>
  mulberry32((seed ^ Math.imul(index + 1, PHI)) >>> 0)();

/** Value noise on an integer lattice, smoothstep-interpolated and centered on zero; span is in
 * lattice cells. */
export const valueNoise = (unit: (index: number) => number, span: number): number => {
  const cell = Math.floor(span);
  return lerp(unit(cell), unit(cell + 1), smoothstep(span - cell));
};

export interface WaveLayer {
  period: number;
  weight: number;
  phase?: number;
}

/** Sum of sine layers; period and t share units. */
export const waves = (t: number, layers: readonly WaveLayer[]): number =>
  layers.reduce(
    (sum, { period, weight, phase = 0 }) => sum + weight * Math.sin((TAU * t) / period + phase),
    0,
  );

/** One-sided exponential decay; zero for negative age. */
export const expDecay = (age: number, tau: number): number => (age < 0 ? 0 : Math.exp(-age / tau));

/** FNV-1a 32-bit hash of a string. */
export const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};
