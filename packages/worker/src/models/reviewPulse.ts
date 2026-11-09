import type { ReviewNodeEvent, TraceEvent } from "@essayist/core";

import { expDecay, fnv1a, unitHash, valueNoise, type WaveLayer, waves } from "#/utils/math.ts";

/** One pulse input: epoch ms timing with a normalized strength. */
export interface PulseSample {
  t: number;
  v: number;
}

const RETENTION_MS = 90_000;
const MAX_SAMPLES = 600;
const PING_STRENGTH = 0.22;
const SIZE_RANGE = 0.35;
const SATURATION_CHARS = 6_000;
const DECAY_MS = 1100;
const SOFT = 0.9;
const WINDOW_MS = 60_000;
// The resting band: above zero by more than the wander can swing, so bars breathe without folding.
const IDLE_BASE = 0.0;

const TRACE_FLOOR: Record<Exclude<TraceEvent["type"], "custom">, number> = {
  node_start: 0.35,
  node_end: 0.6,
};

const NODE_EVENT_FLOOR: { [K in ReviewNodeEvent["type"]]: number } = {
  prompt: 0.55,
  reasoning: 0.5,
  output: 0.55,
  repair: 0.45,
  retry: 0.45,
  model_call: 0.6,
  applied: 0.5,
};

const pulses = new Map<string, PulseSample[]>();

export const pulseStore = {
  push(runId: string, sample: PulseSample): void {
    const samples = pulses.getOrInsertComputed(runId, () => []);
    samples.push(sample);
    while (samples.length > 0 && samples[0].t < sample.t - RETENTION_MS) samples.shift();
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    for (const [id, entry] of pulses) {
      const last = entry.at(-1);
      if (last !== undefined && last.t < sample.t - RETENTION_MS) pulses.delete(id);
    }
  },
  samples(runId: string): readonly PulseSample[] {
    return pulses.get(runId) ?? [];
  },
};

export const pingSample = (): PulseSample => ({ t: Date.now(), v: PING_STRENGTH });

const payloadLength = (event: ReviewNodeEvent): number => {
  if (event.type === "prompt" || event.type === "reasoning") return event.text.length;
  if (event.type === "repair") return event.raw.length;
  if (event.type === "output") return JSON.stringify(event.output).length;
  return 40;
};

export const sampleFromEvent = (event: TraceEvent): PulseSample => {
  if (event.type !== "custom") return { t: event.at, v: TRACE_FLOOR[event.type] };
  const base = NODE_EVENT_FLOOR[event.event.type];
  const size = SIZE_RANGE * (Math.log1p(payloadLength(event.event)) / Math.log1p(SATURATION_CHARS));
  return { t: event.at, v: Math.min(1, base + size) };
};

// The idle life of the strip: layered drift waves plus seeded value-noise grain, re-anchored to the
// run id so every run drifts differently.
const DRIFT: readonly WaveLayer[] = [
  { period: 14_500, weight: 0.07 },
  { period: 5_400, weight: 0.04, phase: 1.7 },
  { period: 1_320, weight: 0.03, phase: 4.2 },
];
const GRAIN: readonly { cellMs: number; weight: number }[] = [
  { cellMs: 1200, weight: 0.2 },
  { cellMs: 320, weight: 0.1 },
];

/** Bar values in [0, 1) for the last minute: value i is the mixed strength at bar i's window
 * cell end. Soft-limited, so stacked events compress without flattening. */
export const barValues = (runId: string, count: number, at: number): readonly number[] => {
  const seed = fnv1a(runId);
  const unit = (index: number): number => unitHash(seed, index);
  const cellMs = WINDOW_MS / count;
  const from = at - WINDOW_MS;
  const raws = Array.from({ length: count }, (_, i) => {
    const t = from + (i + 1) * cellMs;
    return (
      IDLE_BASE +
      waves(t, DRIFT) +
      GRAIN.reduce(
        (sum, { cellMs: grainCell, weight }) => sum + weight * valueNoise(unit, t / grainCell),
        0,
      )
    );
  });
  for (const sample of pulseStore.samples(runId)) {
    if (sample.t < from) continue;
    for (let i = 0; i < count; i++) {
      raws[i] += sample.v * expDecay(from + (i + 1) * cellMs - sample.t, DECAY_MS);
    }
  }
  return raws.map((raw) => Math.max(0, Math.tanh(raw / SOFT)));
};
