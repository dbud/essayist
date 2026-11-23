/** The field passes draw at this fraction of the canvas resolution: the field is a blur, so it
    scales up without visible loss. */
// TODO -- lower to 1/2, then 1/4, once the passes match the single-pass shader at full resolution
export const FIELD_SCALE = 1;

/** The textures each pass draws into, as in the README. */
const FIELD_A_TARGETS = 4;
const FIELD_B_TARGETS = 3;

export type FloatSupport = "EXT_color_buffer_float" | "EXT_color_buffer_half_float";

/** Enables rendering into 16-bit float textures, which the field passes blend into, and returns
    the extension that allows it. Either does: 16-bit float targets can be blended under both, so
    no blending extension is needed. */
export function enableFloatTargets(gl: WebGL2RenderingContext): FloatSupport | null {
  for (const name of ["EXT_color_buffer_float", "EXT_color_buffer_half_float"] as const) {
    if (gl.getExtension(name) !== null) return name;
  }
  return null;
}

export interface Target {
  readonly framebuffer: WebGLFramebuffer;
  readonly textures: readonly WebGLTexture[];
  readonly width: number;
  readonly height: number;
  /** False when the driver refuses the framebuffer despite the extension. */
  readonly complete: boolean;
}

export interface MeltTargets {
  readonly fieldA: Target;
  readonly fieldB: Target;
  readonly fill: Target;
  /** Makes the targets at least the size of a frame in device pixels, the field ones scaled down
      by FIELD_SCALE. They only grow, so roots of different sizes don't reallocate them. */
  ensure(width: number, height: number): void;
  dispose(): void;
}

interface Format {
  readonly internal: number;
  readonly type: number;
  readonly filter: number;
}

/** Creates the off-screen targets of the multi-pass melt. The context needs float targets. */
export function createMeltTargets(gl: WebGL2RenderingContext): MeltTargets {
  // The field is read filtered, so it scales up smoothly; the fills are read pixel for pixel.
  const field: Format = { internal: gl.RGBA16F, type: gl.HALF_FLOAT, filter: gl.LINEAR };
  const colour: Format = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST };

  let fieldA = createTarget(gl, FIELD_A_TARGETS, field, 1, 1);
  let fieldB = createTarget(gl, FIELD_B_TARGETS, field, 1, 1);
  let fill = createTarget(gl, 1, colour, 1, 1);

  return {
    get fieldA() {
      return fieldA;
    },
    get fieldB() {
      return fieldB;
    },
    get fill() {
      return fill;
    },
    ensure(width, height) {
      const fieldWidth = Math.ceil(width * FIELD_SCALE);
      const fieldHeight = Math.ceil(height * FIELD_SCALE);
      fieldA = grown(gl, fieldA, FIELD_A_TARGETS, field, fieldWidth, fieldHeight);
      fieldB = grown(gl, fieldB, FIELD_B_TARGETS, field, fieldWidth, fieldHeight);
      fill = grown(gl, fill, 1, colour, width, height);
    },
    dispose() {
      for (const target of [fieldA, fieldB, fill]) deleteTarget(gl, target);
    },
  };
}

function grown(
  gl: WebGL2RenderingContext,
  target: Target,
  count: number,
  format: Format,
  width: number,
  height: number,
): Target {
  if (target.width >= width && target.height >= height) return target;
  deleteTarget(gl, target);
  return createTarget(
    gl,
    count,
    format,
    Math.max(target.width, width),
    Math.max(target.height, height),
  );
}

function createTarget(
  gl: WebGL2RenderingContext,
  count: number,
  format: Format,
  width: number,
  height: number,
): Target {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const textures = Array.from({ length: count }, (_, i) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internal, width, height, 0, gl.RGBA, format.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
    return texture;
  });
  gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffer, textures, width, height, complete };
}

function deleteTarget(gl: WebGL2RenderingContext, target: Target) {
  gl.deleteFramebuffer(target.framebuffer);
  for (const texture of target.textures) gl.deleteTexture(texture);
}
