#version 300 es
precision highp float;

// Each shape spreads a soft field. The field is the box of the shape smoothed with a Gaussian of
// width sigma: it is 1 deep inside the box and falls to 0 a few sigma outside. The fields of the
// shapes in a group add up, and a pixel is inside the melted outline where the sum passes a
// threshold, so close shapes join where their fields overlap. Within the outline, each shape keeps
// its own colour, and the space between shapes takes the average colour of the shapes nearby.
// Groups are drawn in order, each over the ones before. Lengths are in device pixels.

// MAX_SHAPES and MAX_GROUPS come from renderer.ts.

uniform vec2 u_size;
uniform float u_sigma;
uniform float u_gain;
uniform float u_bias;
// The centre in xy and the half size in zw.
uniform vec4 u_box[MAX_SHAPES];
uniform vec4 u_color[MAX_SHAPES];
uniform float u_radius[MAX_SHAPES];
uniform int u_groupEnd[MAX_GROUPS];
uniform int u_groups;

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

vec2 erf2(vec2 v) {
  return vec2(erf(v.x), erf(v.y));
}

const float INV_SQRT2 = 0.70710678;
const float HALF_PIXEL = 0.5;

// The field of a box at p, measured from the centre of the box. Smoothing a step with a Gaussian
// gives an erf curve, so smoothing a span from -h to h gives the difference of two of them, halved.
// The box is a span along each axis, so its field is the product of the two.
float boxField(vec2 p, vec2 half_size) {
  // erf takes the distance in units of sigma times the square root of 2.
  vec2 s = vec2(INV_SQRT2 / u_sigma);
  vec2 lo = erf2((p + half_size) * s);
  vec2 hi = erf2((p - half_size) * s);
  vec2 f = 0.5 * (lo - hi);
  return f.x * f.y;
}

// The signed distance to a rounded box: negative inside, positive outside.
float roundBox(vec2 p, vec2 half_size, float radius) {
  radius = min(radius, min(half_size.x, half_size.y));
  vec2 q = abs(p) - half_size + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// The field of a rounded box, from two estimates that are each exact in some places and too high
// elsewhere, so the smaller one is closer. The field of the plain box is exact where the corners
// are square, and too high where they are rounded off. The field of the half-plane at the nearest
// edge is exact along straight edges, and too high outside the box everywhere else, as the box
// lies inside that half-plane.
float shapeField(vec2 p, vec2 half_size, float radius) {
  float edge = 0.5 - 0.5 * erf(roundBox(p, half_size, radius) * INV_SQRT2 / u_sigma);
  return min(boxField(p, half_size), edge);
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

    for (int i = start; i < end; i++) {
      vec2 local = p - u_box[i].xy;
      vec4 color = vec4(u_color[i].rgb * u_color[i].a, u_color[i].a);
      field += color * shapeField(local, u_box[i].zw, u_radius[i]);
      // The fraction of this pixel inside the shape: 1 more than half a pixel inside the edge, 0
      // more than half a pixel outside, and linear in between.
      float coverage = clamp(HALF_PIXEL - roundBox(local, u_box[i].zw, u_radius[i]), 0.0, 1.0);
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
    result = groupColor + result * (1.0 - groupColor.a);
  }

  outColor = result;
}
