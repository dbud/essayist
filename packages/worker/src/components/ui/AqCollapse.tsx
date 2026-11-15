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
  const classes = ["aq-collapse"];
  if (fade) classes.push("aq-collapse-fade");
  if (extra) classes.push(extra);

  return (
    <div class={classes.join(" ")} data-open={open ? "" : undefined}>
      <div class="aq-collapse-clip">{children}</div>
    </div>
  );
}
