#version 300 es

void main() {
  // Vertices 0, 1 and 2 map to (0, 0), (2, 0) and (0, 2), then to clip space (-1, -1), (3, -1)
  // and (-1, 3): a triangle twice the size of the canvas, which covers it fully.
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
