import Section from "@/islands/Section.tsx";
import { useFile } from "@/signals/file.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

export default function ExportPreviewSection() {
  const path = openedFiles.selected.value;
  if (!path) return null;

  return (
    <Section title="Export Preview">
      <MarkdownPreview path={path} />
    </Section>
  );
}

function MarkdownPreview({ path }: { path: string }) {
  const file = useFile(path);
  const md = file.markdown.value;

  if (md === null) return null;

  return (
    <pre class="text-xs whitespace-pre-wrap break-words bg-base-200 p-2 rounded">
      {md}
    </pre>
  );
}
