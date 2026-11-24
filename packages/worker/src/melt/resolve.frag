// Composes a group from the sums of its field passes and its fills, and draws it over the groups
// before it: where the field passes its threshold, the outline, with the colour of the shapes or of
// the shapes nearby between them, the rim, shade, stroke, glow and shadow. Colours are
// premultiplied.

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
// The height of the light above the page, in radians.
uniform float u_lightElevation;
// Half the thickness of the slab, the radius of its rounded edge, in device pixels.
uniform float u_rimWidth;
// How bright the spot of the light is.
uniform float u_rimHighlight;
// How small the spot of the light is. Higher is a tighter, glossier spot.
uniform float u_rimShine;
// How bright the broad glow round the light is.
uniform float u_rimSheen;

// The steps of the search for the outline.
const int OUTLINE_STEPS = 6;
// How broad the glow round the light is, as a shine.
const float GLOW_SHINE = 2.0;

out vec4 outColor;

// The brightness of a reflection of the light, from 0 to 1. `towards` is how directly the surface
// reflects the light, and `flatTowards` the same for the flat top, which is subtracted so the flat
// top stays unlit. A higher shine makes a smaller, sharper reflection.
float lobe(float towards, float flatTowards, float shine) {
  // pow is undefined for a base of 0 and a shine of 0.
  float flatLobe = pow(max(flatTowards, 1e-6), shine);
  return max(pow(max(towards, 1e-6), shine) - flatLobe, 0.0) / max(1.0 - flatLobe, 1e-6);
}

// The distance from a pixel to the melted outline, in device pixels, up to `reach`. It walks along
// `direction`, a step of a device pixel towards the outline, and halves the interval until it finds
// where the field drops to `edgeField`. `here` is the field at the pixel.
float outlineDistance(vec2 at, float here, vec2 direction, float edgeField, float reach) {
  if (here <= edgeField) return 0.0;
  if (texture(u_field, at + direction * reach).a > edgeField) return reach;
  float near = 0.0;
  float far = reach;
  for (int k = 0; k < OUTLINE_STEPS; k++) {
    float middle = 0.5 * (near + far);
    if (texture(u_field, at + direction * middle).a > edgeField) {
      near = middle;
    } else {
      far = middle;
    }
  }
  return 0.5 * (near + far);
}

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

  // The rim and the shade change the colour but not the opacity, so the soft edge keeps its
  // coverage. An edge faces against the slope of the field.
  vec2 outward = -slope / steepness;
  // The shape is a slab as thick as twice u_rimWidth, its edge a half circle seen from the side.
  // From above, its surface turns from facing out at the melted outline to facing the viewer
  // u_rimWidth inside it. The distance to the outline is searched in the field rather than taken
  // from its slope, so the turn follows the melted outline and not the shapes melted into it. The
  // rim is what the surface mirrors of a single light: a broad glow and a tight spot round the
  // same direction, so it reads as a single surface and fades round the edges that face away.
  // Both are measured against what the flat top mirrors, so the inside of the shape keeps its own
  // colour.
  vec2 towardsOutline = outward.x * dx + outward.y * dy;
  float toOutline = outlineDistance(at, field.a, towardsOutline, edgeField, u_rimWidth);
  // A slab of no thickness is flat all over.
  float across = u_rimWidth > 0.0 ? 1.0 - toOutline / u_rimWidth : 0.0;
  vec3 normal = vec3(outward * across, sqrt(1.0 - across * across));
  vec3 mirrored = vec3(2.0 * normal.z * normal.xy, 2.0 * normal.z * normal.z - 1.0);
  vec3 light = vec3(u_light * cos(u_lightElevation), sin(u_lightElevation));
  float towards = max(dot(mirrored, light), 0.0);
  float flatTowards = max(light.z, 0.0);
  float spot = lobe(towards, flatTowards, u_rimShine);
  float sheen = lobe(towards, flatTowards, GLOW_SHINE);
  // Strong settings approach the rim colour gradually instead of clipping, which would flatten
  // the glow into a band of a single brightness.
  float rim = (1.0 - exp(-(u_rimHighlight * spot + u_rimSheen * sheen))) * rimColor.a;
  // The shade darkens where the normal turns away from the light, against the flat top.
  float flatLight = max(light.z, 1e-3);
  float shade = clamp((flatLight - dot(normal, light)) / flatLight, 0.0, 1.0) * shadeColor.a;
  groupColor.rgb = mix(groupColor.rgb, rimColor.rgb / max(rimColor.a, 1e-6) * groupColor.a, rim);
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
