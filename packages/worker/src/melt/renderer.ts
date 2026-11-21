import FRAGMENT from "./melt.frag?raw";
import VERTEX from "./melt.vert?raw";
import type { MeltFrame } from "./shapes.ts";

const MAX_SHAPES = 32;
const MAX_LAYERS = 4;
// Keeps the shader from dividing by zero when sigma is set to 0.
const MIN_SIGMA = 0.001;

export interface MeltRenderer {
  draw(frame: MeltFrame, pixelRatio: number): void;
  dispose(): void;
}

export function createMeltRenderer(canvas: HTMLCanvasElement): MeltRenderer | null {
  const context = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (context === null) return null;
  const gl: WebGL2RenderingContext = context;
  const program = linkProgram(gl);
  if (program === null) return null;

  const vertexArray = gl.createVertexArray();
  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    size: at("u_size"),
    sigma: at("u_sigma"),
    gain: at("u_gain"),
    bias: at("u_bias"),
    box: at("u_box"),
    color: at("u_color"),
    radius: at("u_radius"),
    layerEnd: at("u_layerEnd"),
    layers: at("u_layers"),
  };
  const box = new Float32Array(MAX_SHAPES * 4);
  const color = new Float32Array(MAX_SHAPES * 4);
  const radius = new Float32Array(MAX_SHAPES);
  const layerEnd = new Int32Array(MAX_LAYERS);

  function draw(frame: MeltFrame, pixelRatio: number) {
    const width = Math.max(1, Math.round(frame.width * pixelRatio));
    const height = Math.max(1, Math.round(frame.height * pixelRatio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const shapes = frame.shapes.filter((shape) => shape.layer < MAX_LAYERS).slice(0, MAX_SHAPES);
    layerEnd.fill(0);
    let layers = 0;
    shapes.forEach((shape, i) => {
      box.set(
        [
          shape.x * pixelRatio,
          shape.y * pixelRatio,
          shape.halfWidth * pixelRatio,
          shape.halfHeight * pixelRatio,
        ],
        i * 4,
      );
      color.set(shape.color, i * 4);
      radius[i] = shape.radius * pixelRatio;
      layerEnd[shape.layer] = i + 1;
      layers = Math.max(layers, shape.layer + 1);
    });
    // A layer with no shapes ends where the layer before it ends.
    for (let layer = 1; layer < layers; layer++) {
      layerEnd[layer] = Math.max(layerEnd[layer], layerEnd[layer - 1]);
    }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform1f(uniforms.sigma, Math.max(frame.sigma * pixelRatio, MIN_SIGMA));
    gl.uniform1f(uniforms.gain, frame.gain);
    gl.uniform1f(uniforms.bias, frame.bias);
    gl.uniform4fv(uniforms.box, box);
    gl.uniform4fv(uniforms.color, color);
    gl.uniform1fv(uniforms.radius, radius);
    gl.uniform1iv(uniforms.layerEnd, layerEnd);
    gl.uniform1i(uniforms.layers, layers);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
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
    gl.shaderSource(shader, withDefines(source, { MAX_SHAPES, MAX_LAYERS }));
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
