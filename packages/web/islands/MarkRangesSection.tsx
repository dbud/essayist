import Section from "@/islands/Section.tsx";
import { useMarks } from "@/signals/marks.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

export default function MarkRangesSection() {
  const path = openedFiles.selected.value;
  if (!path) return null;

  return (
    <Section title="Mark Regions">
      <MarkRanges path={path} />
    </Section>
  );
}

function MarkRanges({ path }: { path: string }) {
  const { ranges } = useMarks(path);
  if (ranges.value.length === 0) return null;

  return (
    <pre class="text-xs whitespace-pre-wrap break-words bg-base-200 p-2 rounded">
      {JSON.stringify(ranges.value, null, 2)}
    </pre>
  );
}
