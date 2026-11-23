import { createMultiPassRenderer } from "./multipass.ts";
import type { PackedFrame } from "./pack.ts";
import type { MeltRenderer } from "./renderer.ts";
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

/** What draws in the shared context: the multi-pass renderer and the targets it draws into. */
interface Pipeline {
  readonly floatSupport: FloatSupport;
  readonly targets: MeltTargets;
  readonly renderer: MeltRenderer;
}

// A page gets a few WebGL contexts at most, so every group renders through a single one and copies
// the result into a 2D canvas of its own.
interface Shared {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  /** Null while the context is lost. */
  pipeline: Pipeline | null;
  readonly listeners: Set<MeltContextListener>;
  readonly dispose: () => void;
}

let shared: Shared | null = null;
// Set up fails the same way for every root of the page, and costs a context and the shaders.
let unsupported = false;
const PIXEL = new Uint8Array(4);

/** Joins the shared context, or returns null where the melt can't run: without WebGL2, without
    float render targets, or when a target or a shader is refused. Its groups then keep their CSS
    backgrounds. */
export function acquireMeltContext(listener: MeltContextListener): MeltContext | null {
  if (unsupported) return null;
  shared ??= createShared();
  const current = shared;
  if (current === null) {
    unsupported = true;
    return null;
  }
  current.listeners.add(listener);

  return {
    render(frame, target) {
      const { pipeline } = current;
      if (pipeline === null) return false;
      // The canvas only grows, so groups of different sizes don't reallocate it on every frame.
      if (current.canvas.width < frame.width) current.canvas.width = frame.width;
      if (current.canvas.height < frame.height) current.canvas.height = frame.height;
      pipeline.renderer.draw(frame);
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

/** Sets up the renderer and its targets, or returns null where they can't run. Whether a target
    is refused depends on its format, not its size, so the first, smallest targets tell. */
function setUp(gl: WebGL2RenderingContext): Pipeline | null {
  const floatSupport = enableFloatTargets(gl);
  if (floatSupport === null) return null;
  const targets = createMeltTargets(gl);
  if (![targets.fieldA, targets.fieldB, targets.fill].every((target) => target.complete)) {
    targets.dispose();
    return null;
  }
  const renderer = createMultiPassRenderer(gl, targets);
  if (renderer === null) {
    targets.dispose();
    return null;
  }
  return { floatSupport, targets, renderer };
}

function createShared(): Shared | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (context === null) return null;
  const gl: WebGL2RenderingContext = context;
  const pipeline = setUp(gl);
  if (pipeline === null) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const state: Shared = { canvas, gl, pipeline, listeners: new Set(), dispose };

  function onLost(event: Event) {
    // Without preventDefault the browser never restores the context.
    event.preventDefault();
    state.pipeline = null;
    for (const listener of state.listeners) listener.lost();
  }

  function onRestored() {
    // A restored context starts without extensions or resources. Should it come back unable to run
    // the melt, the groups keep their CSS backgrounds.
    state.pipeline = setUp(gl);
    if (state.pipeline === null) return;
    for (const listener of state.listeners) listener.restored();
  }

  function dispose() {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    state.pipeline?.renderer.dispose();
    state.pipeline?.targets.dispose();
    state.pipeline = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return state;
}

/** For the debug readout: the extension that allows float targets, and the size of the targets. */
export function meltTargetStatus(): string {
  if (unsupported) return "unsupported: CSS fallback";
  if (shared === null) return "no context yet";
  if (shared.pipeline === null) return "context lost";
  const { floatSupport, targets } = shared.pipeline;
  const describe = (name: string, target: Target) => `${name} ${target.width}×${target.height}`;
  return [
    floatSupport,
    describe("field A", targets.fieldA),
    describe("field B", targets.fieldB),
    describe("fill", targets.fill),
  ].join(" · ");
}

/** Loses the shared context and restores it after a delay, to try the fallback by hand. */
export function simulateContextLoss(delay = 2000) {
  const lose = shared?.gl.getExtension("WEBGL_lose_context");
  if (lose === null || lose === undefined) return;
  lose.loseContext();
  setTimeout(() => lose.restoreContext(), delay);
}
