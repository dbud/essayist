// The crisp fill of a shape, at full resolution, blended over the shapes of its group before it.
// Colours are premultiplied.

flat in int v_shape;

out vec4 outColor;

void main() {
  vec2 p = framePoint();
  vec4 box = shapeValue(v_shape, ROW_BOX);
  vec4 fill = shapeValue(v_shape, ROW_COLOR);
  float radius = min(shapeValue(v_shape, ROW_SHAPE).x, min(box.z, box.w));
  // The fraction of this pixel inside the shape: 1 more than half a pixel inside the edge, 0 more
  // than half a pixel outside, and linear in between.
  float coverage = clamp(HALF_PIXEL - roundBox(p - box.xy, box.zw, radius), 0.0, 1.0);
  outColor = vec4(fill.rgb * fill.a, fill.a) * coverage;
}
