import { FIELD_REACH } from "./layout.ts";
import FRAGMENT from "./melt.frag?raw";
import VERTEX from "./melt.vert?raw";
import { type PackedFrame, ROW } from "./pack.ts";
import { createShapeTexture } from "./shapeTexture.ts";

export interface MeltRenderer {
  draw(frame: PackedFrame): void;
  dispose(): void;
}

/** Draws each frame into the lower left corner of the canvas of gl, which has to be at least as
    large as the frame. */
export function createMeltRenderer(gl: WebGL2RenderingContext): MeltRenderer | null {
  const program = compileProgram(gl, VERTEX, FRAGMENT);
  if (program === null) return null;

  const vertexArray = gl.createVertexArray();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    size: at("u_size"),
    sigma: at("u_sigma"),
    gain: at("u_gain"),
    bias: at("u_bias"),
    light: at("u_light"),
    shapes: at("u_shapes"),
    groups: at("u_groups"),
    debug: at("u_debug"),
  };
  const shapes = createShapeTexture(gl);

  function draw(frame: PackedFrame) {
    gl.viewport(0, 0, frame.width, frame.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    shapes.upload(frame, 0);

    gl.uniform2f(uniforms.size, frame.width, frame.height);
    gl.uniform1f(uniforms.sigma, frame.sigma);
    gl.uniform1f(uniforms.gain, frame.gain);
    gl.uniform1f(uniforms.bias, frame.bias);
    gl.uniform2fv(uniforms.light, frame.light);
    gl.uniform1i(uniforms.shapes, 0);
    gl.uniform1i(uniforms.groups, frame.groups);
    gl.uniform1i(uniforms.debug, frame.debug ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    shapes.dispose();
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
  }

  return { draw, dispose };
}

/** Compiles and links a program. Every shader gets FIELD_REACH and the ROW_ numbers of the shape
    texture as defines, and the extra ones given. */
export function compileProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  defines: Record<string, number> = {},
): WebGLProgram | null {
  const rows = Object.fromEntries(Object.entries(ROW).map(([name, row]) => [`ROW_${name}`, row]));
  const all = { FIELD_REACH, ...rows, ...defines };
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, withDefines(source, all));
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("melt shader:", gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("melt program:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

/** Adds a #define for each entry, after the #version line, which has to come first. */
function withDefines(source: string, defines: Record<string, number>): string {
  const [version, ...rest] = source.split("\n");
  const lines = Object.entries(defines).map(([name, value]) => `#define ${name} ${value}`);
  return [version, ...lines, ...rest].join("\n");
}
