import { FIELD_REACH } from "./layout.ts";
import { type PackedFrame, ROW } from "./pack.ts";

/** Draws a frame into the lower left corner of the canvas of its context, which has to be at
    least as large as the frame. */
export interface MeltRenderer {
  draw(frame: PackedFrame): void;
  dispose(): void;
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
