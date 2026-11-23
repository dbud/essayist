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
// The stroke width and glow weighted by the field, and the tight and soft shadow fields.
layout(location = 0) out vec4 outEffects;
// The shadow colours and blur, weighted by the tight shadow field.
layout(location = 1) out vec4 outShadowColor;
layout(location = 2) out vec4 outShadowBlur;
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
  // A shadow has two estimates. The tight one blurs the shifted shape with sigma and its own blur,
  // so it follows the melted outline; the soft one blurs the shifted box with its blur alone.
  vec4 shadowColor = shapeValue(i, ROW_SHADOW);
  float tightField = 0.0;
  float softField = 0.0;
  float blur = HALF_PIXEL;
  if (shadowColor.a > 0.0) {
    vec4 shadowShape = shapeValue(i, ROW_SHADOW_SHAPE);
    vec2 shadowLocal = local - shadowShape.xy;
    blur = max(shadowShape.z, HALF_PIXEL);
    float width = sqrt(u_sigma * u_sigma + blur * blur);
    float toShadow = roundBox(shadowLocal, half_size, radius);
    if (toShadow < REACH * width) {
      tightField = toShadow < -REACH * width
        ? 1.0
        : shapeField(shadowLocal, half_size, radius, width);
      softField = toShadow < -REACH * blur ? 1.0 : shapeField(shadowLocal, half_size, radius, blur);
    }
  }
  float shadowWeight = fill.a * tightField;
  outEffects = vec4(sizes.yz * w, shadowWeight, fill.a * softField);
  outShadowColor = vec4(shadowColor.rgb * shadowColor.a, shadowColor.a) * shadowWeight;
  outShadowBlur = vec4(blur * shadowWeight, 0.0, 0.0, 0.0);
#endif
}
