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
        <g transform="translate(1.35 0) skewX(-6)">
          <path d="M5 5v14" pathLength={1} />
          <path d="M5 5h13.5" pathLength={1} />
          <path d="M5 12h9" pathLength={1} />
          <path d="M5 19h13" pathLength={1} />
          <g class="logo-e-window">
            <rect
              class="logo-e-caret fill-accent"
              x="16.3"
              y="9"
              width="2"
              height="6.5"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
