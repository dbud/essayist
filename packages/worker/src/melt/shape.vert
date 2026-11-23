// A quad for each shape of a group, drawn instanced from u_start on. With QUAD_REACH set it covers
// the box and everything the shape draws around it, for the field passes; without, the box and a
// pixel round it, for the crisp edge of the fill pass.

uniform int u_start;

flat out int v_shape;

void main() {
  int i = u_start + gl_InstanceID;
  vec4 box = shapeValue(i, ROW_BOX);
  float margin = QUAD_REACH == 1 ? shapeValue(i, ROW_SHAPE).w : 1.0;
  // Vertices 0 to 3 of a triangle strip are the corners (0, 0), (1, 0), (0, 1) and (1, 1).
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p = box.xy + (corner * 2.0 - 1.0) * (box.zw + margin);
  // The frame counts y down from the top; clip space counts it up from the bottom.
  gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0);
  v_shape = i;
}
