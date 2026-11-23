import { createMultiPassRenderer } from "./multipass.ts";
import type { PackedFrame } from "./pack.ts";
import { createMeltRenderer, type MeltRenderer } from "./renderer.ts";
import { addTime } from "./stats.ts";
import {
  createMeltTargets,
  enableFloatTargets,
  type FloatSupport,
  type MeltTargets,
  type Target,
} from "./targets.ts";

export interface MeltContextListener {
  lost(): void;
  restored(): void;
}

export interface MeltContext {
  /** Renders a frame and copies it into the target, which has to be the size of the frame.
      Returns false while the context is lost. */
  render(frame: PackedFrame, target: CanvasRenderingContext2D): boolean;
  release(): void;
}

// A page gets a few WebGL contexts at most, so every group renders through a single one and copies
// the result into a 2D canvas of its own.
interface Shared {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  renderer: MeltRenderer | null;
  /** Null where the multi-pass melt can't run, which then falls back to CSS. */
  floatSupport: FloatSupport | null;
  /** Made for the first frame that asks for the multi-pass renderer, or a debug frame. */
  targets: MeltTargets | null;
  /** Undefined until a frame asks for it; null when the device can't run it. */
  multiPass: MeltRenderer | null | undefined;
  readonly listeners: Set<MeltContextListener>;
  readonly dispose: () => void;
}

let shared: Shared | null = null;
const PIXEL = new Uint8Array(4);

/** Joins the shared context, or returns null without WebGL2. */
export function acquireMeltContext(listener: MeltContextListener): MeltContext | null {
  shared ??= createShared();
  const current = shared;
  if (current === null) return null;
  current.listeners.add(listener);

  return {
    render(frame, target) {
      if (current.renderer === null) return false;
      // The canvas only grows, so groups of different sizes don't reallocate it on every frame.
      if (current.canvas.width < frame.width) current.canvas.width = frame.width;
      if (current.canvas.height < frame.height) current.canvas.height = frame.height;
      if ((frame.debug || frame.multiPass) && current.floatSupport !== null) {
        current.targets ??= createMeltTargets(current.gl);
        current.targets.ensure(frame.width, frame.height, frame.fieldScale);
      }
      // TODO -- draw only with the multi-pass renderer, and fall back to CSS without it
      const renderer = frame.multiPass
        ? (multiPassOf(current) ?? current.renderer)
        : current.renderer;
      renderer.draw(frame);
      // Reading a pixel back waits for the GPU, unlike finish in some browsers, so the readout can
      // show how long the shader takes. It stalls the pipeline, so only while debugging.
      if (frame.debug) {
        const waited = performance.now();
        current.gl.readPixels(0, 0, 1, 1, current.gl.RGBA, current.gl.UNSIGNED_BYTE, PIXEL);
        addTime("gpu", performance.now() - waited);
      }
      // The frame sits in the lower left corner, and drawImage counts from the top.
      const top = current.canvas.height - frame.height;
      target.clearRect(0, 0, frame.width, frame.height);
      target.drawImage(
        current.canvas,
        0,
        top,
        frame.width,
        frame.height,
        0,
        0,
        frame.width,
        frame.height,
      );
      return true;
    },
    release() {
      current.listeners.delete(listener);
      if (current.listeners.size > 0) return;
      current.dispose();
      if (shared === current) shared = null;
    },
  };
}

function createShared(): Shared | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (context === null) return null;
  const gl: WebGL2RenderingContext = context;
  const renderer = createMeltRenderer(gl);
  if (renderer === null) return null;

  const state: Shared = {
    canvas,
    gl,
    renderer,
    floatSupport: enableFloatTargets(gl),
    targets: null,
    multiPass: undefined,
    listeners: new Set(),
    dispose,
  };

  function onLost(event: Event) {
    // Without preventDefault the browser never restores the context.
    event.preventDefault();
    state.renderer = null;
    state.targets = null;
    state.multiPass = undefined;
    for (const listener of state.listeners) listener.lost();
  }

  function onRestored() {
    // A restored context starts without extensions or resources.
    state.floatSupport = enableFloatTargets(gl);
    state.renderer = createMeltRenderer(gl);
    if (state.renderer === null) return;
    for (const listener of state.listeners) listener.restored();
  }

  function dispose() {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    state.renderer?.dispose();
    state.renderer = null;
    state.multiPass?.dispose();
    state.multiPass = undefined;
    state.targets?.dispose();
    state.targets = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return state;
}

/** The multi-pass renderer, made on first use, or null when the device can't run it: without float
    targets, with a target the driver refuses, or when its shaders don't compile. */
function multiPassOf(state: Shared): MeltRenderer | null {
  if (state.multiPass !== undefined) return state.multiPass;
  const { targets } = state;
  const complete =
    targets !== null && [targets.fieldA, targets.fieldB, targets.fill].every((t) => t.complete);
  state.multiPass = complete ? createMultiPassRenderer(state.gl, targets) : null;
  return state.multiPass;
}

/** For the debug readout: how this device supports the multi-pass melt, and its targets once a
    debug frame has made them. */
export function meltTargetStatus(): string {
  if (shared === null) return "no context";
  const { floatSupport, targets, multiPass } = shared;
  if (floatSupport === null) return "no float targets: CSS fallback";
  if (targets === null) return `${floatSupport}, no targets yet`;
  const describe = (name: string, target: Target) =>
    `${name} ${target.width}×${target.height}${target.complete ? "" : " incomplete"}`;
  const renderer =
    multiPass === undefined
      ? "multi-pass not tried"
      : multiPass === null
        ? "multi-pass failed"
        : "multi-pass ready";
  return [
    floatSupport,
    describe("field A", targets.fieldA),
    describe("field B", targets.fieldB),
    describe("fill", targets.fill),
    renderer,
  ].join(" · ");
}

/** Loses the shared context and restores it after a delay, to try the fallback by hand. */
export function simulateContextLoss(delay = 2000) {
  const lose = shared?.gl.getExtension("WEBGL_lose_context");
  if (lose === null || lose === undefined) return;
  lose.loseContext();
  setTimeout(() => lose.restoreContext(), delay);
}
