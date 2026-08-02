import {
  BL_PATH,
  BR_PATH,
  LEFT_PATH,
  RIGHT_PATH,
  TL_PATH,
  TR_PATH,
} from "@/components/ui/pillClipPaths.ts";

/** Hidden SVG with clip paths (objectBoundingBox, 0..1 coords). Pseudo-elements
 *  sized to match give no distortion. Render once in the app shell. */
export function PillClipDefs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <clipPath id="pill-cap-left" clipPathUnits="objectBoundingBox">
        <path d={LEFT_PATH} />
      </clipPath>
      <clipPath id="pill-cap-right" clipPathUnits="objectBoundingBox">
        <path d={RIGHT_PATH} />
      </clipPath>
      <clipPath id="corner-tl" clipPathUnits="objectBoundingBox">
        <path d={TL_PATH} />
      </clipPath>
      <clipPath id="corner-tr" clipPathUnits="objectBoundingBox">
        <path d={TR_PATH} />
      </clipPath>
      <clipPath id="corner-bl" clipPathUnits="objectBoundingBox">
        <path d={BL_PATH} />
      </clipPath>
      <clipPath id="corner-br" clipPathUnits="objectBoundingBox">
        <path d={BR_PATH} />
      </clipPath>
    </svg>
  );
}
