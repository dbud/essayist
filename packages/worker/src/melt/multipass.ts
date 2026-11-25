import COMMON from "./common.glsl?raw";
import FIELD from "./field.frag?raw";
import FILL from "./fill.frag?raw";
import FRAGMENT from "./fragment.glsl?raw";
import OUTLINE from "./outline.frag?raw";
import type { PackedFrame, PackedGroup } from "./pack.ts";
import { compileProgram, type MeltRenderer } from "./renderer.ts";
import RESOLVE_FRAGMENT from "./resolve.frag?raw";
import RESOLVE_VERTEX from "./resolve.vert?raw";
import SHAPE from "./shape.vert?raw";
import { createShapeTexture } from "./shapeTexture.ts";
import { fieldSize, type MeltTargets, type Target } from "./targets.ts";

const VERSION = "#version 300 es";
const vertexSource = (body: string) => [VERSION, COMMON, body].join("\n");
const fragmentSource = (body: string) => [VERSION, COMMON, FRAGMENT, body].join("\n");

// The texels cleared round a group in the field targets, past what the resolve pass reads there.
const FIELD_MARGIN = 2;

// The texture units: the shapes on 0, and the targets the resolve pass reads after them.
const SHAPES_UNIT = 0;
const RESOLVE_INPUTS = [
  "u_field",
  "u_rim",
  "u_shade",
  "u_stroke",
  "u_effects",
  "u_shadowColor",
  "u_shadowBlur",
  "u_ambientColor",
  "u_fill",
] as const;

/** Draws a frame group by group, each in its own area: the field passes add up the fields of its
    shapes, the fill pass draws their crisp edges, and the resolve pass composes the group over the
    groups before it. See the README. */
export function createMultiPassRenderer(
  gl: WebGL2RenderingContext,
  targets: MeltTargets,
): MeltRenderer | null {
  const fieldA = compileProgram(gl, vertexSource(SHAPE), fragmentSource(FIELD), {
    QUAD_REACH: 1,
    FIELD_PASS: 0,
  });
  const fieldB = compileProgram(gl, vertexSource(SHAPE), fragmentSource(FIELD), {
    QUAD_REACH: 1,
    FIELD_PASS: 1,
  });
  const fill = compileProgram(gl, vertexSource(SHAPE), fragmentSource(FILL), { QUAD_REACH: 0 });
  const resolve = compileProgram(
    gl,
    vertexSource(RESOLVE_VERTEX),
    fragmentSource(RESOLVE_FRAGMENT),
  );
  const outline = compileProgram(gl, vertexSource(SHAPE), fragmentSource(OUTLINE), {
    QUAD_REACH: 0,
  });
  if (fieldA === null || fieldB === null || fill === null || resolve === null || outline === null) {
    return null;
  }
  // Captured after the check, so the functions below see them compiled.
  const programs = { fieldA, fieldB, fill, resolve, outline };

  const vertexArray = gl.createVertexArray();
  const shapes = createShapeTexture(gl);

  gl.useProgram(resolve);
  RESOLVE_INPUTS.forEach((name, i) => {
    gl.uniform1i(gl.getUniformLocation(resolve, name), SHAPES_UNIT + 1 + i);
  });

  /** Sets the uniforms every program shares. */
  function useProgram(
    program: WebGLProgram,
    frame: PackedFrame,
    target: readonly [number, number],
  ) {
    gl.useProgram(program);
    const at = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform1i(at("u_shapes"), SHAPES_UNIT);
    gl.uniform2f(at("u_size"), frame.width, frame.height);
    gl.uniform2f(at("u_target"), target[0], target[1]);
    gl.uniform1f(at("u_sigma"), frame.sigma);
    return at;
  }

  /** Binds a target, draws into size pixels of it, which span the frame, and limits drawing to the
      area of a group there, counting from the bottom left. Clears that area of every texture of
      the target. */
  function clearArea(
    target: Target,
    group: PackedGroup,
    size: readonly [number, number],
    frame: PackedFrame,
    margin = 0,
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, size[0], size[1]);
    const [scaleX, scaleY] = [size[0] / frame.width, size[1] / frame.height];
    const left = Math.floor(group.left * scaleX);
    const right = Math.ceil(group.right * scaleX);
    const bottom = Math.floor(size[1] - group.bottom * scaleY);
    const top = Math.ceil(size[1] - group.top * scaleY);
    // The margin is cleared too, but not drawn into. Clearing only follows the scissor, so it can
    // reach past the frame, into the rest of the target left over from a larger frame.
    const area = {
      left: Math.max(0, left - margin),
      right: Math.min(target.width, right + margin),
      bottom: Math.max(0, bottom - margin),
      top: Math.min(target.height, top + margin),
    };
    gl.scissor(area.left, area.bottom, area.right - area.left, area.top - area.bottom);
    target.textures.forEach((_, i) => gl.clearBufferfv(gl.COLOR, i, [0, 0, 0, 0]));
    gl.scissor(
      left,
      Math.max(0, bottom),
      right - left,
      Math.min(size[1], top) - Math.max(0, bottom),
    );
  }

  function draw(frame: PackedFrame) {
    targets.ensure(frame.width, frame.height, frame.fieldScale);
    const full = [frame.width, frame.height] as const;
    const field = fieldSize(frame.width, frame.height, frame.fieldScale);

    gl.bindVertexArray(vertexArray);
    shapes.upload(frame, SHAPES_UNIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, frame.width, frame.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);

    for (const group of frame.groupList) {
      const count = group.end - group.start;
      if (group.right <= group.left || group.bottom <= group.top) continue;

      // The field passes add up the shapes.
      gl.blendFunc(gl.ONE, gl.ONE);
      for (const [program, target] of [
        [programs.fieldA, targets.fieldA],
        [programs.fieldB, targets.fieldB],
      ] as const) {
        // The resolve pass reads the field filtered, and a device pixel to each side for the
        // slopes, so at the edge of the group it reaches into the texels around it.
        clearArea(target, group, field, frame, FIELD_MARGIN);
        const at = useProgram(program, frame, field);
        gl.uniform1i(at("u_start"), group.start);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      }

      // The fill pass draws each shape over the ones before it.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      clearArea(targets.fill, group, full, frame);
      const fillAt = useProgram(programs.fill, frame, full);
      gl.uniform1i(fillAt("u_start"), group.start);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

      // The resolve pass reads them all and draws the group over the canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, frame.width, frame.height);
      const inputs = [
        ...targets.fieldA.textures,
        ...targets.fieldB.textures,
        ...targets.fill.textures,
      ];
      inputs.forEach((texture, i) => {
        gl.activeTexture(gl.TEXTURE0 + SHAPES_UNIT + 1 + i);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      });
      const at = useProgram(programs.resolve, frame, full);
      gl.uniform2f(at("u_fieldSize"), targets.fieldA.width, targets.fieldA.height);
      // The exact ratio of the field to the frame, as its size is rounded up to whole pixels.
      gl.uniform2f(at("u_fieldScale"), field[0] / frame.width, field[1] / frame.height);
      gl.uniform1f(at("u_gain"), frame.gain);
      gl.uniform1f(at("u_bias"), frame.bias);
      gl.uniform2fv(at("u_light"), frame.light);
      gl.uniform1f(at("u_lightElevation"), frame.lightElevation);
      gl.uniform1f(at("u_rimWidth"), frame.rimWidth);
      gl.uniform1f(at("u_rimHighlight"), frame.rimHighlight);
      gl.uniform1f(at("u_rimShine"), frame.rimShine);
      gl.uniform1f(at("u_rimSheen"), frame.rimSheen);
      gl.uniform1f(at("u_grain"), frame.grain);
      gl.uniform4f(at("u_rect"), group.left, group.top, group.right, group.bottom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // The next group draws into these targets, which mustn't stay bound for reading.
      inputs.forEach((_, i) => {
        gl.activeTexture(gl.TEXTURE0 + SHAPES_UNIT + 1 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      });
    }

    gl.disable(gl.SCISSOR_TEST);
    if (frame.debug) {
      // Every shape of the frame, over the canvas.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const at = useProgram(programs.outline, frame, full);
      gl.uniform1i(at("u_start"), 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.groupList.at(-1)?.end ?? 0);
    }
    gl.disable(gl.BLEND);
  }

  function dispose() {
    shapes.dispose();
    gl.deleteVertexArray(vertexArray);
    for (const program of Object.values(programs)) gl.deleteProgram(program);
  }

  return { draw, dispose };
}
