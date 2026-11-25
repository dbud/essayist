// What a shape adds to the field of its group, blended by adding. Each target holds a sum over the
// shapes of the group, which the resolve pass reads. FIELD_PASS 0 is pass A and 1 is pass B, as
// WebGL guarantees only four targets in a pass. Colours are premultiplied.

flat in int v_shape;

#if FIELD_PASS == 0
// The field weighted by colour; its alpha is the field itself, each shape counted by its opacity.
layout(location = 0) out vec4 outField;
// The rim, shade and stroke colours, weighted by the field, so the resolve pass can divide them out.
layout(location = 1) out vec4 outRim;
layout(location = 2) out vec4 outShade;
layout(location = 3) out vec4 outStroke;
#else
// The stroke width and glow weighted by the field, and the key shadow field, with the last unused.
layout(location = 0) out vec4 outEffects;
// The key shadow colours, each as dark as the key shadow of its shape, weighted by its field.
layout(location = 1) out vec4 outShadowColor;
// The blur of the key shadow, weighted by its field, then the ambient shadow field and its blur,
// weighted by that field.
layout(location = 2) out vec4 outShadowBlur;
// The ambient shadow colours, each as dark as the ambient shadow of its shape, weighted by its
// field.
layout(location = 3) out vec4 outAmbientColor;
#endif

void main() {
  vec2 p = framePoint();
  int i = v_shape;
  vec4 box = shapeValue(i, ROW_BOX);
  vec4 sizes = shapeValue(i, ROW_SHAPE);
  vec4 fill = shapeValue(i, ROW_COLOR);
  vec2 local = p - box.xy;
  vec2 half_size = box.zw;
  float radius = min(sizes.x, min(half_size.x, half_size.y));
  float toEdge = roundBox(local, half_size, radius);
  // Past the reach the field is 0, and deep inside it is flat at 1, so the integral is skipped.
  float f = toEdge > REACH * u_sigma
    ? 0.0
    : toEdge < -REACH * u_sigma ? 1.0 : shapeField(local, half_size, radius, u_sigma);
  float w = fill.a * f;

#if FIELD_PASS == 0
  vec4 rim = shapeValue(i, ROW_RIM);
  vec4 shade = shapeValue(i, ROW_SHADE);
  vec4 stroke = shapeValue(i, ROW_STROKE);
  outField = vec4(fill.rgb * fill.a, fill.a) * f;
  outRim = vec4(rim.rgb * rim.a, rim.a) * w;
  outShade = vec4(shade.rgb * shade.a, shade.a) * w;
  outStroke = vec4(stroke.rgb * stroke.a, stroke.a) * w;
#else
  // Each shadow blurs its shifted shape with sigma and its own blur, so it follows the melted
  // outline, and the resolve pass reads the distance to that outline from it.
  vec4 shadowColor = shapeValue(i, ROW_SHADOW);
  vec4 shadowShape = shapeValue(i, ROW_SHADOW_SHAPE);
  vec4 ambient = shapeValue(i, ROW_SHADOW_AMBIENT);
  float tightField = 0.0;
  float ambientField = 0.0;
  float blur = HALF_PIXEL;
  float ambientBlur = max(ambient.x, HALF_PIXEL);
  if (shadowColor.a > 0.0) {
    vec2 shadowLocal = local - shadowShape.xy;
    blur = max(shadowShape.z, HALF_PIXEL);
    float width = sqrt(u_sigma * u_sigma + blur * blur);
    float toShadow = roundBox(shadowLocal, half_size, radius);
    if (toShadow < REACH * width) {
      tightField = toShadow < -REACH * width
        ? 1.0
        : shapeField(shadowLocal, half_size, radius, width);
    }
    float ambientWidth = sqrt(u_sigma * u_sigma + ambientBlur * ambientBlur);
    if (toEdge < REACH * ambientWidth) {
      ambientField = toEdge < -REACH * ambientWidth
        ? 1.0
        : shapeField(local, half_size, radius, ambientWidth);
    }
  }
  float shadowWeight = fill.a * tightField;
  float ambientWeight = fill.a * ambientField;
  vec4 shadowPremultiplied = vec4(shadowColor.rgb * shadowColor.a, shadowColor.a);
  outEffects = vec4(sizes.yz * w, shadowWeight, 0.0);
  outShadowColor = shadowPremultiplied * shadowShape.w * shadowWeight;
  outShadowBlur = vec4(blur * shadowWeight, ambientWeight, ambientBlur * ambientWeight, 0.0);
  outAmbientColor = shadowPremultiplied * ambient.y * ambientWeight;
#endif
}
