// Composes a group from the sums of its field passes and its fills, as the end of the group loop in
// melt.frag, and draws it over the groups before it. Colours are premultiplied.

// Field pass A, as field.frag.
uniform highp sampler2D u_field;
uniform highp sampler2D u_rim;
uniform highp sampler2D u_shade;
uniform highp sampler2D u_stroke;
// Field pass B, as field.frag.
uniform highp sampler2D u_effects;
uniform highp sampler2D u_shadowColor;
uniform highp sampler2D u_shadowBlur;
// The fill pass, at the resolution of the canvas.
uniform highp sampler2D u_fill;
// The allocated size of the field targets, and how many of their pixels a device pixel spans in x
// and y.
uniform vec2 u_fieldSize;
uniform vec2 u_fieldScale;
uniform float u_gain;
uniform float u_bias;
// Towards the light, with y pointing up.
uniform vec2 u_light;

// The width of the rim, in device pixels.
const float RIM_WIDTH = 0.75;
// How much of the rim and the shade wraps round to the other edges.
const float RIM_BASE = 0.2;
// The width of the shade, in device pixels.
const float SHADE_WIDTH = 1.5;

out vec4 outColor;

void main() {
  // The field targets and the canvas both count from the bottom left, so a pixel of the canvas maps
  // to the field by its scale. A device pixel apart in x and y, for the slopes.
  vec2 at = gl_FragCoord.xy * u_fieldScale / u_fieldSize;
  vec2 dx = vec2(u_fieldScale.x / u_fieldSize.x, 0.0);
  vec2 dy = vec2(0.0, u_fieldScale.y / u_fieldSize.y);

  vec4 field = texture(u_field, at);
  vec4 rims = texture(u_rim, at);
  vec4 shades = texture(u_shade, at);
  vec4 strokes = texture(u_stroke, at);
  vec4 effectsAndShadow = texture(u_effects, at);
  vec2 effects = effectsAndShadow.xy;
  float shadowField = effectsAndShadow.z;
  float shadowBox = effectsAndShadow.w;
  vec4 shadowColors = texture(u_shadowColor, at);
  float shadowSigmas = texture(u_shadowBlur, at).x;
  vec4 shapes = texelFetch(u_fill, ivec2(gl_FragCoord.xy), 0);

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

  // The slope of the field, in window coordinates, where y points up, from the field a device
  // pixel to either side. Dividing the field by it gives the distance to the melted edge, where the
  // outline is half opaque, in device pixels.
  vec2 slope = 0.5 * vec2(
    texture(u_field, at + dx).a - texture(u_field, at - dx).a,
    texture(u_field, at + dy).a - texture(u_field, at - dy).a
  );
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
  vec2 shadowGradient = 0.5 * vec2(
    texture(u_effects, at + dx).z - texture(u_effects, at - dx).z,
    texture(u_effects, at + dy).z - texture(u_effects, at - dy).z
  );
  float shadowSlope = max(length(shadowGradient), 1e-6);
  float shadowInside = (shadowField - edgeField) / shadowSlope;
  float shadowBlur = shadowField > 0.0 ? shadowSigmas / shadowField : HALF_PIXEL;
  float tight = 0.5 + 0.5 * erf(shadowInside * INV_SQRT2 / shadowBlur);
  float soft = min(shadowBox, 1.0);
  float shadowCover = mix(tight, soft, smoothstep(0.25 * u_sigma, 0.75 * u_sigma, shadowBlur));
  vec4 shadow = shadowField > 0.0 ? shadowColors / shadowField * shadowCover : vec4(0.0);
  groupColor += shadow * (1.0 - groupColor.a);

  outColor = groupColor;
}
