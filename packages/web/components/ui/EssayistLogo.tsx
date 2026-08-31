import { logoMark } from "@/components/ui/logo-mark.ts";

interface EssayistLogoProps {
  class?: string;
}

export default function EssayistLogo({
  class: className = "",
}: EssayistLogoProps) {
  return (
    <div
      class={`logo-e flex select-none justify-center bg-ink scheme-light ${className}`}
    >
      <svg
        class="text-surface mt-[calc(20%+1px)] aspect-square w-3/5"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <g transform={logoMark.transform}>
          {logoMark.paths.map((d) => (
            <path d={d} pathLength={1} />
          ))}
          <g class="logo-e-window">
            <rect
              class="logo-e-caret fill-accent"
              x={logoMark.caret.x}
              y={logoMark.caret.y}
              width={logoMark.caret.width}
              height={logoMark.caret.height}
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
