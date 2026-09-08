import Slider from "@/components/ui/Slider.tsx";
import { autoSaveInterval } from "@/signals/preferences.ts";

const INTERVALS = [2, 5, 10, 15, 30, 60, 120];

function formatSeconds(seconds: number) {
  return seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`;
}

export default function AutoSaveIntervalSelect() {
  return (
    <Slider
      class="cell"
      label="Autosave interval"
      values={INTERVALS}
      value={autoSaveInterval.value}
      onChange={(v) => (autoSaveInterval.value = v)}
      format={formatSeconds}
    />
  );
}
