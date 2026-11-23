// Shared by the fragment shaders of the multi-pass melt, after common.glsl.

// The size in pixels of the part of the target being drawn, which spans the frame.
uniform vec2 u_target;

// The point of the frame under this fragment.
vec2 framePoint() {
  return vec2(gl_FragCoord.x, u_target.y - gl_FragCoord.y) * (u_size / u_target);
}
