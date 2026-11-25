import { Toaster } from "#/components/Toaster.tsx";
import Melt from "#/components/ui/Melt.tsx";
import { showTaskToast, showToast } from "#/models/utils/toast.ts";

import MeltDemo from "./MeltDemo.tsx";

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

function HomePage() {
  // useEffect(seedToasts, []);

  return (
    <main class="min-h-svh">
      <MeltDemo />
      <Melt class="flex flex-wrap items-start gap-4 p-8">
        <button type="button" class="btn" onClick={() => showToast("Saved")}>
          Info
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => showToast("Imported 3 files from Google Docs", "success")}
        >
          Success
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => showToast("Could not reach the server", "error")}
        >
          Error
        </button>
        <button type="button" class="btn" onClick={runTask}>
          Task
        </button>
        <button type="button" class="btn" onClick={seedToasts}>
          All
        </button>
      </Melt>

      <Toaster />
    </main>
  );
}

export default function Page() {
  return <HomePage />;
}
