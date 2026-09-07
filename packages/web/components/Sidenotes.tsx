import type { LexicalEditor } from "lexical";
import GhostSidenote from "@/components/GhostSidenote.tsx";
import Sidenote from "@/components/Sidenote.tsx";
import { useElementHeights } from "@/hooks/useElementHeights.ts";
import type { ScrollContainerRef } from "@/hooks/useScrollViewport.ts";
import type { SidenoteView } from "@/signals/sidenotes.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";

const clamp = (x: number) => Math.min(1, Math.max(0, x));

interface SidenotesProps {
  wsId: string;
  path: string;
  editor: LexicalEditor | null;
  scrollContainerRef: ScrollContainerRef;
}

export default function Sidenotes({
  wsId,
  path,
  editor,
  scrollContainerRef,
}: SidenotesProps) {
  const {
    heights,
    entries,
    scrollTop,
    viewportLayout,
    topGhost,
    bottomGhost,
    viewportHeight,
  } = getSidenotes(wsId, path);
  // Measure rendered sidenote heights for stacking. Re-measure when the
  // entries change and on marks-column width changes. `entries` is independent
  // of `heights`, so this can't cycle with its own output. Sidenotes stay
  // visibility:hidden until measured so the unstacked first paint never shows
  // overlap. Ghosts omit data-thread-id so they aren't measured.
  const innerRef = useElementHeights<HTMLDivElement>(heights, {
    selector: "[data-thread-id]",
    key: "threadId",
    deps: [entries.value],
  });

  // Sidenotes stay invisible until measured, and whenever they touch a
  // viewport edge (inclusive), where the pinned ghost takes over. Visible
  // is the exact complement of the ghost conditions, so the handoff is
  // seamless.
  const isHidden = (v: SidenoteView) =>
    !heights.value.has(v.entry.mark.thread_id) ||
    (viewportHeight.value > 0 &&
      (v.top <= scrollTop.value ||
        v.top + v.height >= scrollTop.value + viewportHeight.value));

  // Ghost boxes in content coordinates; absent ghosts fall outside the
  // panel derivation via infinities.
  const topGhostHeight = topGhost.value
    ? (heights.value.get(topGhost.value.entry.mark.thread_id) ?? 0)
    : 0;
  const bottomGhostHeight = bottomGhost.value
    ? (heights.value.get(bottomGhost.value.entry.mark.thread_id) ?? 0)
    : 0;
  const topGhostBottom = topGhost.value
    ? scrollTop.value + topGhostHeight
    : Number.NEGATIVE_INFINITY;
  const bottomGhostTop = bottomGhost.value
    ? scrollTop.value + viewportHeight.value - bottomGhostHeight
    : Number.POSITIVE_INFINITY;

  // Paper panel behind the fully-visible sidenotes: it spans from the first
  // visible note (or the bottom ghost's head, when it pokes above) to the
  // last visible note (or the top ghost's tail, when it hangs below), and
  // occludes the ghost parts in between. The ghosts' edge-anchored parts
  // outside the panel stay visible.
  const visible = viewportLayout.value.filter((v) => !isHidden(v));
  const first = visible.at(0);
  const last = visible.at(-1);
  const panelTop = Math.min(
    first ? first.top : Number.POSITIVE_INFINITY,
    bottomGhostTop,
  );
  const panelBottom = Math.max(
    last ? last.top + last.height : Number.NEGATIVE_INFINITY,
    topGhostBottom,
  );
  const hasPanel = panelTop < panelBottom;

  // The panel casts a shadow onto a ghost only while its edge sits inside
  // that ghost's box (partial coverage).
  const coversTopGhost = hasPanel && panelTop < topGhostBottom;
  const coversBottomGhost = hasPanel && panelBottom > bottomGhostTop;

  // Partial occlusion of each ghost (0..1): drives the ghost's fade and
  // the panel shadow intensity.
  const topOcclusion =
    topGhost.value && hasPanel
      ? clamp((topGhostBottom - panelTop) / topGhostHeight)
      : 0;
  const bottomOcclusion =
    bottomGhost.value && hasPanel
      ? clamp((panelBottom - bottomGhostTop) / bottomGhostHeight)
      : 0;

  return (
    <div
      class="relative h-full"
      ref={innerRef}
      style={{ "--vp-h": `${viewportHeight.value}px` }}
    >
      {/* Ghost slots render first, so real sidenotes paint over them. */}
      {bottomGhost.value && (
        <GhostSidenote
          key={bottomGhost.value.key}
          view={bottomGhost.value}
          editor={editor}
          scrollContainerRef={scrollContainerRef}
          occlusion={bottomOcclusion}
        />
      )}
      {topGhost.value && (
        <GhostSidenote
          key={topGhost.value.key}
          view={topGhost.value}
          editor={editor}
          scrollContainerRef={scrollContainerRef}
          occlusion={topOcclusion}
        />
      )}
      {hasPanel && (
        <div
          class={`sidenote-panel${coversTopGhost ? " is-covered-top" : ""}${
            coversBottomGhost ? " is-covered-bottom" : ""
          }`}
          style={{
            top: panelTop,
            height: panelBottom - panelTop,
            "--occlusion-top": String(topOcclusion),
            "--occlusion-bottom": String(bottomOcclusion),
          }}
        />
      )}
      {viewportLayout.value.map((v) => (
        <Sidenote key={v.key} view={v} editor={editor} hidden={isHidden(v)} />
      ))}
    </div>
  );
}
