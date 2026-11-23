// Shared by the shaders of the multi-pass melt, after #version and the defines from renderer.ts:
// FIELD_REACH and the ROW_ numbers of the shape texture. Lengths are in device pixels, measured
// from the top left of the frame.

precision highp float;
precision highp int;

// A column per shape, with a row for each of its values, as ROW in pack.ts. A float texture is only
// exact with full precision, which samplers don't get by default.
uniform highp sampler2D u_shapes;
// The size of the frame.
uniform vec2 u_size;
uniform float u_sigma;

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

// A value of shape i, as a row of the shape texture.
vec4 shapeValue(int i, int row) {
  return texelFetch(u_shapes, ivec2(i, row), 0);
}

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
