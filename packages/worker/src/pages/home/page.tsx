import { useSignal } from "@preact/signals";
import { Bold, Code, Heart, Italic, Plus, Strikethrough } from "lucide-preact";

import MeltFilter from "#/components/ui/MeltFilter.tsx";

import { AqMenu, AqProjects } from "./aq";

/** Lab furniture: toggles html.aq-melt-off. */
function MeltToggle() {
  const off = useSignal(false);

  return (
    <button
      type="button"
      class="aq-lab__melt-toggle"
      data-off={off.value ? "" : undefined}
      onClick={() => {
        off.value = !off.value;
        document.documentElement.classList.toggle("aq-melt-off", off.value);
      }}
    >
      melt: {off.value ? "off" : "on"}
    </button>
  );
}

function HomePage() {
  return (
    <main class="aq-lab">
      <MeltFilter />
      <MeltToggle />
      <div class="aq-lab__row aq-melt">
        <button type="button" class="aq-btn" disabled>
          <Plus />
          <span>New project</span>
        </button>
        <button type="button" class="aq-btn">
          <Plus />
          <span>New essay</span>
        </button>
        <div class="flex gap-4">
          <button type="button" class="aq-btn">
            <Bold />
          </button>
          <button type="button" class="aq-btn--accent">
            <Italic />
          </button>
          <button type="button" class="aq-btn">
            <Strikethrough />
          </button>
          <button type="button" class="aq-btn">
            <Code />
          </button>
        </div>
        <button type="button" class="aq-btn--accent">
          <Heart />
          <span>Review</span>
        </button>
      </div>
      <div class="aq-lab__cols">
        <div class="aq-lab__row">
          <AqProjects />
        </div>
        <div class="aq-lab__row">
          <AqMenu />
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <HomePage />;
}
