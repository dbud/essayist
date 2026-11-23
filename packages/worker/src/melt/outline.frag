// Outlines the measured box of a shape, to compare the geometry with the melt. Drawn over the
// canvas after every group while debugging. Cyan doesn't appear in the design.

flat in int v_shape;

out vec4 outColor;

void main() {
  vec2 p = framePoint();
  vec4 box = shapeValue(v_shape, ROW_BOX);
  float radius = min(shapeValue(v_shape, ROW_SHAPE).x, min(box.z, box.w));
  float line = clamp(1.0 - abs(roundBox(p - box.xy, box.zw, radius)), 0.0, 1.0);
  outColor = vec4(0.0, 1.0, 1.0, 1.0) * line;
}
