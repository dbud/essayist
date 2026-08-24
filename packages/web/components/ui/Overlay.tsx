interface OverlayProps {
  when?: boolean;
  local?: boolean;
  capture?: boolean;
}

export default function Overlay({
  when = true,
  local = false,
  capture = false,
}: OverlayProps) {
  const position = local ? "absolute inset-0" : "fixed inset-0";
  const pointer = capture ? "pointer-events-auto" : "pointer-events-none";
  return (
    <div
      class={`overlay ${position} ${pointer} ${when ? "is-open" : ""}`}
      aria-hidden="true"
    />
  );
}
