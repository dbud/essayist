import {
  SQ_BL,
  SQ_BL_RING,
  SQ_BR,
  SQ_BR_RING,
  SQ_TL,
  SQ_TL_RING,
  SQ_TR,
  SQ_TR_RING,
} from "@/components/ui/pillClipPaths.ts";

const MASK_VARS = `:root {
  --sq-tl: ${SQ_TL};
  --sq-tr: ${SQ_TR};
  --sq-bl: ${SQ_BL};
  --sq-br: ${SQ_BR};
  --sq-tl-ring: ${SQ_TL_RING};
  --sq-tr-ring: ${SQ_TR_RING};
  --sq-bl-ring: ${SQ_BL_RING};
  --sq-br-ring: ${SQ_BR_RING};
}`;

/** Mask-image vars for the squircle utility (see squircle.css). Render once in
 *  the app shell so they're present in SSR HTML (no FOUC). */
export function PillClipDefs() {
  return (
    // Injected raw so Preact never HTML-escapes the url() tokens (a <style> is
    // a raw-text element, so entities wouldn't be decoded). Path math lives in
    // pillClipPaths.ts.
    <style
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: MASK_VARS }}
    />
  );
}
