import { logoMark } from "#/components/logo/logo-mark.ts";

interface EssayistLogoProps {
  class?: string;
}

export default function EssayistLogo({ class: className = "" }: EssayistLogoProps) {
  return (
    <div class={`logo-e flex select-none justify-center items-center ${className}`}>
      <svg class="aspect-square w-5/8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
