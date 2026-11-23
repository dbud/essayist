// A quad over the area of a group: its left, top, right and bottom in u_rect.

uniform vec4 u_rect;

void main() {
  // Vertices 0 to 3 of a triangle strip are the corners (0, 0), (1, 0), (0, 1) and (1, 1).
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p = mix(u_rect.xy, u_rect.zw, corner);
  // The frame counts y down from the top; clip space counts it up from the bottom.
  gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0);
}
