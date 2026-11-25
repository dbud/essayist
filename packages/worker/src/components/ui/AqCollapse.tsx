import type { ComponentChildren } from "preact";

export default function AqCollapse({
  open,
  fade = false,
  class: extra,
  children,
}: {
  open: boolean;
  fade?: boolean;
  class?: string;
  children: ComponentChildren;
}) {
  const classes = ["collapsible"];
  if (fade) classes.push("collapsible-fade");
  if (extra) classes.push(extra);

  return (
    <div class={classes.join(" ")} data-open={open ? "" : undefined}>
      <div class="collapsible-clip">{children}</div>
    </div>
  );
}
