import { getFile } from "@/signals/file.ts";

interface SaveStatusProps {
  wsId: string;
  path: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SaveStatus({ wsId, path }: SaveStatusProps) {
  const file = getFile(wsId, path);
  const { saving, saveError, dirty, snapshot } = file;
  const savedAt = snapshot.value?.timestamp;

  let label = savedAt === undefined ? "Saved" : `Saved ${formatTime(savedAt)}`;
  if (saving.value) label = "Saving...";
  else if (dirty.value && saveError.value) label = "Save failed";
  else if (dirty.value) label = "Unsaved";

  return (
    <div
      class="cell cell--data whitespace-nowrap"
      title={saveError.value || label}
    >
      {label}
    </div>
  );
}
