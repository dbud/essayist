#version 300 es
precision highp float;

// Each shape spreads a soft field. The field is the rounded box of the shape smoothed with a
// Gaussian of width sigma: it is 1 deep inside the box and falls to 0 a few sigma outside. The
// fields of the shapes in a group add up, and a pixel is inside the melted outline where the sum
// passes a threshold, so close shapes join where their fields overlap. Within the outline, each
// shape keeps its own colour, and the space between shapes takes the average colour of the shapes
// nearby. Groups are drawn in order, each over the ones before. Lengths are in device pixels.

// MAX_SHAPES, MAX_GROUPS and FIELD_REACH come from renderer.ts.

uniform vec2 u_size;
uniform float u_sigma;
uniform float u_gain;
uniform float u_bias;
// The centre in xy and the half size in zw.
uniform vec4 u_box[MAX_SHAPES];
// The colours are not premultiplied.
uniform vec4 u_color[MAX_SHAPES];
uniform vec4 u_stroke[MAX_SHAPES];
uniform vec4 u_rim[MAX_SHAPES];
uniform vec4 u_shade[MAX_SHAPES];
uniform vec4 u_shadow[MAX_SHAPES];
// The shadow offset in xy and its Gaussian width in z.
uniform vec4 u_shadowShape[MAX_SHAPES];
// The corner radius, stroke width and glow.
uniform vec4 u_shape[MAX_SHAPES];
uniform int u_groupEnd[MAX_GROUPS];
uniform int u_groups;
// Towards the light, with y pointing up.
uniform vec2 u_light;
uniform bool u_debug;

out vec4 outColor;

// The error function, approximated with a polynomial to about 1e-7.
const float ERF_P = 0.3275911;
const float ERF_A1 = 0.254829592;
const float ERF_A2 = -0.284496736;
const float ERF_A3 = 1.421413741;
const float ERF_A4 = -1.453152027;
const float ERF_A5 = 1.061405429;

float erf(float x) {
  float t = 1.0 / (1.0 + ERF_P * abs(x));
  float poly = ERF_A1 + t * (ERF_A2 + t * (ERF_A3 + t * (ERF_A4 + t * ERF_A5)));
  return sign(x) * (1.0 - t * poly * exp(-x * x));
}

const float INV_SQRT2 = 0.70710678;
const float SQRT_2PI = 2.50662827;
const float HALF_PIXEL = 0.5;
// FIELD_REACH as a float, as GLSL does not convert int to float.
const float REACH = float(FIELD_REACH);
const int FIELD_SAMPLES = 8;
// The width of the rim, in device pixels.
const float RIM_WIDTH = 0.75;
// How much of the rim and the shade wraps round to the other edges.
const float RIM_BASE = 0.2;
// The width of the shade, in device pixels.
const float SHADE_WIDTH = 1.5;

// The signed distance to a rounded box: negative inside, positive outside.
float roundBox(vec2 p, vec2 half_size, float radius) {
  vec2 q = abs(p) - half_size + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// The field at x of the row of a rounded box at height y. A row is a span, narrower inside the
// rounded corners, and smoothing a span from -w to w with a Gaussian gives the difference of two
// erf curves, halved. erf takes the distance in units of sigma times the square root of 2.
float rowField(float x, float y, vec2 half_size, float radius, float sigma) {
  float into = max(abs(y) - (half_size.y - radius), 0.0);
  float w = half_size.x - radius + sqrt(max(radius * radius - into * into, 0.0));
  float s = INV_SQRT2 / sigma;
  return 0.5 * (erf((x + w) * s) - erf((x - w) * s));
}

// The field of a rounded box at p, measured from its centre: the fields of its rows, weighted by a
// Gaussian of the vertical distance to each row. Only rows within reach of p count, and their sum
// is taken at evenly spaced samples.
float shapeField(vec2 p, vec2 half_size, float radius, float sigma) {
  float reach = REACH * sigma;
  float from = clamp(p.y - reach, -half_size.y, half_size.y);
  float to = clamp(p.y + reach, -half_size.y, half_size.y);
  float spacing = (to - from) / float(FIELD_SAMPLES);
  float sum = 0.0;
  for (int k = 0; k < FIELD_SAMPLES; k++) {
    float y = from + (float(k) + 0.5) * spacing;
    float dy = (p.y - y) / sigma;
    sum += rowField(p.x, y, half_size, radius, sigma) * exp(-0.5 * dy * dy);
  }
  return sum * spacing / (SQRT_2PI * sigma);
}

void main() {
  // gl_FragCoord counts from the bottom, and the boxes count from the top.
  vec2 p = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);
  vec4 result = vec4(0.0);
  int start = 0;

  for (int group = 0; group < MAX_GROUPS; group++) {
    if (group >= u_groups) break;
    int end = u_groupEnd[group];
    // Both are premultiplied colours. field adds up the field of each shape weighted by its colour,
    // so its alpha is the total field, with each shape counted by its opacity. shapes draws the
    // shapes themselves, each later shape over the earlier ones.
    vec4 field = vec4(0.0);
    vec4 shapes = vec4(0.0);
    // The effects of the shapes, weighted like the colours, so the edge takes the effects of the
    // shapes nearby and field.a divides them out. effects holds the stroke width and glow.
    vec4 strokes = vec4(0.0);
    vec4 rims = vec4(0.0);
    vec4 shades = vec4(0.0);
    vec2 effects = vec2(0.0);
    // A shadow has two estimates. A tight one follows the melted outline, shifted by the offset of
    // each shape: shadowField is the field of the shifted shapes, and the shadow blurs across its
    // edge. A soft one blurs the shifted boxes themselves: shadowBox adds up their coverage, which
    // is exact once the blur is wider than the melt and the outline no longer matters. Both are
    // weighted like field.a, and so are the colours and blurs of the shadows.
    float shadowField = 0.0;
    float shadowBox = 0.0;
    vec4 shadowColors = vec4(0.0);
    float shadowSigmas = 0.0;

    for (int i = start; i < end; i++) {
      vec2 local = p - u_box[i].xy;
      vec2 half_size = u_box[i].zw;
      float radius = min(u_shape[i].x, min(half_size.x, half_size.y));
      if (u_shadow[i].a > 0.0) {
        vec2 shadowLocal = local - u_shadowShape[i].xy;
        float blur = max(u_shadowShape[i].z, HALF_PIXEL);
        float width = sqrt(u_sigma * u_sigma + blur * blur);
        float toShadow = roundBox(shadowLocal, half_size, radius);
        if (toShadow < REACH * width) {
          // Deep inside, both blurs are flat at 1, so the integrals are skipped.
          float tightField = toShadow < -REACH * width
            ? 1.0
            : shapeField(shadowLocal, half_size, radius, width);
          float softField = toShadow < -REACH * blur
            ? 1.0
            : shapeField(shadowLocal, half_size, radius, blur);
          float w = u_color[i].a * tightField;
          shadowField += w;
          shadowBox += u_color[i].a * softField;
          shadowColors += vec4(u_shadow[i].rgb * u_shadow[i].a, u_shadow[i].a) * w;
          shadowSigmas += blur * w;
        }
      }

      float toEdge = roundBox(local, half_size, radius);
      if (toEdge > REACH * u_sigma) continue;
      vec4 color = vec4(u_color[i].rgb * u_color[i].a, u_color[i].a);
      // More than the reach inside the edge, the blurred box is flat at 1 (within about 0.1%), so
      // the integral is skipped. The rest still runs here, as the derivatives below need every
      // pixel to take the same path.
      float f = toEdge < -REACH * u_sigma ? 1.0 : shapeField(local, half_size, radius, u_sigma);
      field += color * f;
      float w = color.a * f;
      strokes += vec4(u_stroke[i].rgb * u_stroke[i].a, u_stroke[i].a) * w;
      rims += vec4(u_rim[i].rgb * u_rim[i].a, u_rim[i].a) * w;
      shades += vec4(u_shade[i].rgb * u_shade[i].a, u_shade[i].a) * w;
      effects += u_shape[i].yz * w;
      // The fraction of this pixel inside the shape: 1 more than half a pixel inside the edge, 0
      // more than half a pixel outside, and linear in between.
      float coverage = clamp(HALF_PIXEL - toEdge, 0.0, 1.0);
      shapes = color * coverage + shapes * (1.0 - coverage * color.a);
    }
    start = end;

    // The opacity of the outline rises from 0 to 1 as the total field goes from -bias / gain to
    // (1 - bias) / gain. At the edge, this ramp is a pixel or two wide.
    float outline = clamp(field.a * u_gain + u_bias, 0.0, 1.0);
    vec3 average = field.a > 0.0 ? field.rgb / field.a : vec3(0.0);
    vec4 around = vec4(average * outline, outline);
    // Each shape keeps its own colour, the space around the shapes takes their average colour, and
    // both are cut to the outline.
    vec4 groupColor = shapes * outline + around * (1.0 - shapes.a);

    vec4 stroke = field.a > 0.0 ? strokes / field.a : vec4(0.0);
    vec4 rimColor = field.a > 0.0 ? rims / field.a : vec4(0.0);
    vec4 shadeColor = field.a > 0.0 ? shades / field.a : vec4(0.0);
    vec2 effect = field.a > 0.0 ? effects / field.a : vec2(0.0);
    float strokeWidth = effect.x;
    float glowStrength = effect.y;

    // The slope of the field, in window coordinates, where y points up. Dividing the field by it
    // gives the distance to the melted edge, where the outline is half opaque, in device pixels.
    vec2 slope = vec2(dFdx(field.a), dFdy(field.a));
    float steepness = max(length(slope), 1e-6);
    float edgeField = (0.5 - u_bias) / u_gain;
    float inside = (field.a - edgeField) / steepness;

    // The rim and the shade start where the outline turns opaque, so they land on solid colour.
    // The rim is a line RIM_WIDTH wide, antialiased on its inner side; the shade fades inwards.
    // Both change the colour but not the opacity, so the soft edge keeps its coverage. An edge
    // faces against the slope of the field.
    float solid = (field.a - (1.0 - u_bias) / u_gain) / steepness;
    float facingLight = clamp(dot(-slope / steepness, u_light), 0.0, 1.0);
    float rimLine = clamp(RIM_WIDTH + HALF_PIXEL - max(solid, 0.0), 0.0, 1.0);
    float rim = rimLine * mix(RIM_BASE, 1.0, facingLight) * rimColor.a;
    groupColor.rgb = mix(groupColor.rgb, rimColor.rgb / max(rimColor.a, 1e-6) * groupColor.a, rim);

    // The shade mirrors the rim, on the edges facing away from the light.
    float facingAway = clamp(dot(slope / steepness, u_light), 0.0, 1.0);
    float shade =
      exp(-max(solid, 0.0) / SHADE_WIDTH) * mix(RIM_BASE, 1.0, facingAway) * shadeColor.a;
    groupColor.rgb =
      mix(groupColor.rgb, shadeColor.rgb / max(shadeColor.a, 1e-6) * groupColor.a, shade);

    // The stroke covers the band from the edge to the stroke width inside it.
    float band = clamp(inside + HALF_PIXEL, 0.0, 1.0)
        - clamp(inside - strokeWidth + HALF_PIXEL, 0.0, 1.0);
    groupColor = stroke * band + groupColor * (1.0 - stroke.a * band);

    // The glow sits under the group, and fades with the field from the edge outwards.
    float glow = glowStrength * clamp(field.a / edgeField, 0.0, 1.0);
    groupColor += vec4(average * glow, glow) * (1.0 - groupColor.a);

    // The shadow sits under the group and its glow. The tight estimate blurs across the edge of the
    // shifted outline; the soft one takes over as the blur grows past the melt.
    float shadowSlope = max(length(vec2(dFdx(shadowField), dFdy(shadowField))), 1e-6);
    float shadowInside = (shadowField - edgeField) / shadowSlope;
    float shadowBlur = shadowField > 0.0 ? shadowSigmas / shadowField : HALF_PIXEL;
    float tight = 0.5 + 0.5 * erf(shadowInside * INV_SQRT2 / shadowBlur);
    float soft = min(shadowBox, 1.0);
    float shadowCover = mix(tight, soft, smoothstep(0.25 * u_sigma, 0.75 * u_sigma, shadowBlur));
    vec4 shadow = shadowField > 0.0 ? shadowColors / shadowField * shadowCover : vec4(0.0);
    groupColor += shadow * (1.0 - groupColor.a);

    result = groupColor + result * (1.0 - groupColor.a);
  }

  // Outlines the measured box of every shape, to compare the geometry with the melt. Cyan doesn't
  // appear in the design.
  if (u_debug) {
    int count = u_groups > 0 ? u_groupEnd[u_groups - 1] : 0;
    for (int i = 0; i < MAX_SHAPES; i++) {
      if (i >= count) break;
      vec2 half_size = u_box[i].zw;
      float radius = min(u_shape[i].x, min(half_size.x, half_size.y));
      float line = clamp(1.0 - abs(roundBox(p - u_box[i].xy, half_size, radius)), 0.0, 1.0);
      result = mix(result, vec4(0.0, 1.0, 1.0, 1.0), line);
    }
  }

  outColor = result;
}
