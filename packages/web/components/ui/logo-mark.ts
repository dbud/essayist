export const logoMark = {
  viewBox: { width: 24, height: 24 },
  transform: "translate(1.35 0) skewX(-6)",
  paths: ["M5 5v14", "M5 5h13.5", "M5 12h9", "M5 19h13"],
  caret: { x: 16.3, y: 9, width: 2, height: 6.5 },
  colors: {
    background: "oklch(15% 0.01 60)", // --color-ink, light
    stroke: "oklch(99% 0 0)", // --color-surface, light
    caret: "oklch(62% 0.22 29)", // --color-accent
  },
} as const;
