import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { Toaster } from "#/components/Toaster.tsx";
import MeltFilter from "#/components/ui/MeltFilter.tsx";
import { useMeltCanvas } from "#/melt/useMeltCanvas.ts";
import { showTaskToast, showToast } from "#/models/utils/toast.ts";

/** Toggles html.aq-melt-off to preview the raw geometry. */
function MeltToggle() {
  const off = useSignal(false);

  return (
    <button
      type="button"
      class="aq-btn"
      onClick={() => {
        off.value = !off.value;
        document.documentElement.classList.toggle("aq-melt-off", off.value);
      }}
    >
      melt: {off.value ? "off" : "on"}
    </button>
  );
}

function runTask() {
  const task = showTaskToast("Reviewing essay");
  const total = 8;
  let done = 0;
  const timer = setInterval(() => {
    done++;
    if (done < total) {
      task.step(`Reviewing paragraph ${done + 1} of ${total}`, { done, total });
    } else {
      clearInterval(timer);
      task.settle(`Reviewed ${total} paragraphs`, true);
    }
  }, 600);
}

function seedToasts() {
  showToast("Saved");
  showToast("Imported 3 files from Google Docs", "success");
  showToast("Could not reach the server. Your changes are kept locally.", "error");
  showToast("Uploading images", "info", { done: 2, total: 5 });
}

/** Buttons close together, so the shader and the SVG filter can be compared where they merge. */
function MeltSample({ drawn }: { drawn: boolean }) {
  const melt = useMeltCanvas<HTMLDivElement>();
  return (
    <div ref={drawn ? melt : undefined} class="aq-melt flex items-center gap-1 px-8 py-4">
      <span class="w-28 text-sm opacity-60">{drawn ? "shader" : "svg filter"}</span>
      <button type="button" class="aq-btn">
        Settings
      </button>
      <button type="button" class="aq-btn--accent">
        Review
      </button>
      <button type="button" class="aq-btn--idle">
        Saved
      </button>
      <button type="button" class="aq-btn--small">
        B
      </button>
    </div>
  );
}

function HomePage() {
  useEffect(seedToasts, []);

  return (
    <main class="min-h-svh">
      <MeltSample drawn />
      <MeltSample drawn={false} />
      <div class="aq-melt  flex flex-wrap items-start gap-4 p-8">
        <button type="button" class="aq-btn" onClick={() => showToast("Saved")}>
          Info
        </button>
        <button
          type="button"
          class="aq-btn"
          onClick={() => showToast("Imported 3 files from Google Docs", "success")}
        >
          Success
        </button>
        <button
          type="button"
          class="aq-btn"
          onClick={() => showToast("Could not reach the server", "error")}
        >
          Error
        </button>
        <button type="button" class="aq-btn" onClick={runTask}>
          Task
        </button>
        <button type="button" class="aq-btn" onClick={seedToasts}>
          All
        </button>
        <MeltToggle />
      </div>

      <MeltFilter />
      <Toaster />
    </main>
  );
}

export default function Page() {
  return <HomePage />;
}
