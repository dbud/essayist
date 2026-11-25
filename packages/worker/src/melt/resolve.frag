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
uniform highp sampler2D u_ambientColor;
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
// How strong the grain in the shadows is, as a share of how dark they are.
uniform float u_grain;

const float PI = 3.14159265;
const float SQRT2 = 1.41421356;
// The constant of Winitzki's approximation of the inverse error function.
const float ERFINV_A = 0.147;
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

// The inverse of the cumulative normal distribution, from Winitzki's approximation of the inverse
// error function. The field of a blurred straight edge is that distribution, so this turns a field
// back into a distance, in units of its blur.
float probit(float field) {
  float x = 2.0 * clamp(field, 1e-4, 1.0 - 1e-4) - 1.0;
  float l = log(1.0 - x * x);
  float a = 2.0 / (PI * ERFINV_A) + 0.5 * l;
  return SQRT2 * sign(x) * sqrt(sqrt(a * a - l / ERFINV_A) - a);
}

// The sRGB value of an amount of light from 0 to 1.
float srgb(float light) {
  return light <= 0.0031308 ? 12.92 * light : 1.055 * pow(light, 1.0 / 2.4) - 0.055;
}

// A number from 0 to 1 that looks random, the same for a pixel and a seed on every frame and GPU.
float random(uvec2 pixel, uint seed) {
  uint h = pixel.x * 1664525u + pixel.y * 1013904223u + seed * 2654435769u;
  h ^= h >> 16;
  h *= 2246822519u;
  h ^= h >> 13;
  h *= 3266489917u;
  h ^= h >> 16;
  return float(h) / 4294967295.0;
}

// How much of a light an edge hides, from t = -1, where all of it shows, to t = 1, where it is
// gone. A light with a hard rim would start and stop the fade abruptly, which shows as a crease
// where the penumbra meets the full shadow; real lights soften at their rim, so the fade eases in
// and out.
float penumbra(float t) {
  float u = clamp(0.5 * (t + 1.0), 0.0, 1.0);
  return u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
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
  vec4 shadowColors = texture(u_shadowColor, at);
  vec4 shadowBlurs = texture(u_shadowBlur, at);
  float shadowSigmas = shadowBlurs.x;
  float ambientField = shadowBlurs.y;
  float ambientSigmas = shadowBlurs.z;
  vec4 ambientColors = texture(u_ambientColor, at);
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

  // The shadows sit under the group and its glow. Each field is the shifted shape blurred by sigma
  // and the blur of its shadow, so along a straight edge its probit gives how far inside the
  // shifted outline a pixel is, wherever it is, unlike the slope of the field.
  float outlineDepth = u_sigma * probit(edgeField);

  // The key shadow fades across a penumbra as wide as twice its blur, as an edge hides more and
  // more of the light: dark inside it and clear past it, with no haze beyond.
  float keyBlur = shadowField > 0.0 ? shadowSigmas / shadowField : HALF_PIXEL;
  float keyInside =
    sqrt(u_sigma * u_sigma + keyBlur * keyBlur) * probit(shadowField) - outlineDepth;
  float keyCover = penumbra(keyInside / keyBlur);
  vec4 shadow = shadowField > 0.0 ? shadowColors / shadowField * keyCover : vec4(0.0);

  // The ambient shadow is a crease along the outline: darkest at it and gone as far out as its
  // blur, falling off steeply.
  float ambientBlur = ambientField > 0.0 ? ambientSigmas / ambientField : HALF_PIXEL;
  float ambientInside =
    sqrt(u_sigma * u_sigma + ambientBlur * ambientBlur) * probit(ambientField) - outlineDepth;
  float ambientFade = 1.0 - clamp(-ambientInside / ambientBlur, 0.0, 1.0);
  float ambientCover = ambientFade * ambientFade;
  vec4 ambient = ambientField > 0.0 ? ambientColors / ambientField * ambientCover : vec4(0.0);

  // The two shadows take light away from the page together, each from what the other lets through.
  // A shadow takes away a share of the light, but the page and the canvas blend stored sRGB values,
  // which hold brightness on a curve. So the shadow becomes the sRGB value of the light left on a
  // white page, and the colour of the tint the sRGB value of the light it adds back.
  vec4 occlusion = shadow + ambient * (1.0 - shadow.a);
  // Grain makes each pixel of the shadow take a little more or less light, in proportion to the
  // shadow, so it fades out with it and leaves the shapes and the bare page smooth.
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  float grain = (random(pixel, 2u) + random(pixel, 3u) - 1.0) * u_grain;
  occlusion *= clamp(1.0 + grain, 0.0, 1.0 / max(occlusion.a, 1e-6));
  float lightLeft = 1.0 - occlusion.a;
  float darkened = srgb(lightLeft);
  vec3 tinted = vec3(
    srgb(lightLeft + occlusion.r),
    srgb(lightLeft + occlusion.g),
    srgb(lightLeft + occlusion.b)
  ) - darkened;
  groupColor += vec4(tinted, 1.0 - darkened) * (1.0 - groupColor.a);

  // Noise of a level up and down, so soft gradients don't band. It scales with the opacity, which
  // keeps the colour premultiplied.
  float dither = (random(pixel, 0u) + random(pixel, 1u) - 1.0) / 255.0;
  groupColor.rgb = clamp(groupColor.rgb + dither * groupColor.a, 0.0, groupColor.a);

  outColor = groupColor;
}
