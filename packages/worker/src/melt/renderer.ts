import { FIELD_REACH } from "./layout.ts";
import FRAGMENT from "./melt.frag?raw";
import VERTEX from "./melt.vert?raw";
import { MAX_GROUPS, MAX_SHAPES, type PackedFrame } from "./pack.ts";

export interface MeltRenderer {
  draw(frame: PackedFrame): void;
  dispose(): void;
}

/** Draws each frame into the lower left corner of the canvas of gl, which has to be at least as
    large as the frame. */
export function createMeltRenderer(gl: WebGL2RenderingContext): MeltRenderer | null {
  const program = linkProgram(gl);
  if (program === null) return null;

  const vertexArray = gl.createVertexArray();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    size: at("u_size"),
    sigma: at("u_sigma"),
    gain: at("u_gain"),
    bias: at("u_bias"),
    light: at("u_light"),
    box: at("u_box"),
    color: at("u_color"),
    stroke: at("u_stroke"),
    rim: at("u_rim"),
    shade: at("u_shade"),
    shadow: at("u_shadow"),
    shadowShape: at("u_shadowShape"),
    shape: at("u_shape"),
    groupEnd: at("u_groupEnd"),
    groups: at("u_groups"),
  };

  function draw(frame: PackedFrame) {
    gl.viewport(0, 0, frame.width, frame.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.uniform2f(uniforms.size, frame.width, frame.height);
    gl.uniform1f(uniforms.sigma, frame.sigma);
    gl.uniform1f(uniforms.gain, frame.gain);
    gl.uniform1f(uniforms.bias, frame.bias);
    gl.uniform2fv(uniforms.light, frame.light);
    gl.uniform4fv(uniforms.box, frame.box);
    gl.uniform4fv(uniforms.color, frame.color);
    gl.uniform4fv(uniforms.stroke, frame.stroke);
    gl.uniform4fv(uniforms.rim, frame.rim);
    gl.uniform4fv(uniforms.shade, frame.shade);
    gl.uniform4fv(uniforms.shadow, frame.shadow);
    gl.uniform4fv(uniforms.shadowShape, frame.shadowShape);
    gl.uniform4fv(uniforms.shape, frame.shape);
    gl.uniform1iv(uniforms.groupEnd, frame.groupEnd);
    gl.uniform1i(uniforms.groups, frame.groups);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
  }

  return { draw, dispose };
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, withDefines(source, { MAX_SHAPES, MAX_GROUPS, FIELD_REACH }));
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
