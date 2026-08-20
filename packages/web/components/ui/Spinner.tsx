import { Cog } from "lucide-preact";

export interface SpinnerProps {
  size?: number;
  class?: string;
}

export default function Spinner({
  size = 20,
  class: className = "",
}: SpinnerProps) {
  return (
    <Cog
      size={size}
      class={`animate-spin [animation-duration:2s] ${className}`}
    />
  );
}
