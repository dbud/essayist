import type { ComponentChildren } from "preact";

export interface ContentLayoutProps {
  /** Whether the side-pane column is visible. Controls grid template. */
  withSidePane?: boolean;
  /** Render function receiving column class strings. */
  children: (classes: {
    mainClass: string;
    sideClass: string;
  }) => ComponentChildren;
}

/** Two-column grid. `relative` columns let mark anchors measure offsetTop
 *  against the editor. @container keys the @[64rem]/@[96rem] variants on pane
 *  width. */
export default function ContentLayout({
  withSidePane = false,
  children,
}: ContentLayoutProps) {
  const gridCols = withSidePane
    ? "grid-cols-[2fr_1fr] gap-4 @[64rem]:gap-8"
    : "grid-cols-[1fr_0fr] gap-0 @[64rem]:grid-cols-[2fr_1fr] @[64rem]:gap-8";

  return (
    <div class={`grid w-full mx-auto @[96rem]:max-w-[1400px] ${gridCols}`}>
      {children({
        mainClass: "px-4 @[64rem]:px-16",
        sideClass: "min-w-0 pr-4 @[64rem]:pr-16",
      })}
    </div>
  );
}
