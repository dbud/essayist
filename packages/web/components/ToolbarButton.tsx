import type { ComponentChildren } from "preact";

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children?: ComponentChildren;
}

export default function ToolbarButton({
  active = false,
  disabled = false,
  title,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      class={`btn ${active ? "btn-accent" : ""}`}
    >
      {children}
    </button>
  );
}
