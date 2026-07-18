import type { Mark } from "@essayist/core";
import Section from "@/islands/Section.tsx";
import { getFile } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { workspaces } from "@/signals/workspace.ts";

export default function ExportPreviewSection() {
  const openedFiles = getOpenedFiles();
  const path = openedFiles?.selected.value ?? "";
  if (!openedFiles || !path) return null;
  return (
    <Section title="Export Preview">
      <MarkdownPreview wsId={workspaces.currentWorkspaceId.value} path={path} />
    </Section>
  );
}

interface TextSegment {
  text: string;
  mark?: Mark;
}

function visualizeWhitespace(text: string): string {
  return text
    .replace(/ /g, "\u00B7")
    .replace(/\t/g, "\u2192")
    .replace(/\n/g, "\u00AC\n");
}

function MarkdownPreview({ wsId, path }: { wsId: string; path: string }) {
  const file = getFile(wsId, path);
  const marks = getMarks(wsId, path);
  const md = file.markdown.value;
  const resolved = marks.resolved.value;

  if (md === null) return null;

  const active = resolved.filter((m) => m.status !== "stale");
  const stale = resolved.filter((m) => m.status === "stale");
  const segments = buildSegments(md, active);

  return (
    <>
      <pre class="text-xs whitespace-pre-wrap break-words bg-base-200 p-2 rounded">
        {segments.map((seg, i) =>
          seg.mark ? (
            <span key={i} class="bg-yellow-200" title={seg.mark.comment}>
              {seg.text ? visualizeWhitespace(seg.text) : "\u250A"}
            </span>
          ) : (
            <span key={i}>{visualizeWhitespace(seg.text)}</span>
          ),
        )}
      </pre>
      {stale.length > 0 && (
        <div class="mt-2 text-xs">
          <div class="font-semibold text-base-content/70 mb-1">Stale Marks</div>
          <ul class="flex flex-col gap-1">
            {stale.map((mark) => (
              <li key={mark.id} class="text-base-content/60">
                <span class="font-medium">{mark.label || "Mark"}</span>
                <span class="ml-2">offset: {mark.offset}</span>
                <span class="ml-1">length: {mark.length}</span>
                <span class="ml-1 italic">"{mark.selected_text}"</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function buildSegments(markdown: string, marks: Mark[]): TextSegment[] {
  const sorted = [...marks].sort((a, b) => a.offset - b.offset);

  if (sorted.length === 0) return [{ text: markdown }];

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const mark of sorted) {
    if (mark.offset > cursor) {
      segments.push({ text: markdown.slice(cursor, mark.offset) });
    }
    segments.push({
      text: markdown.slice(mark.offset, mark.offset + mark.length),
      mark,
    });
    cursor = mark.offset + mark.length;
  }

  if (cursor < markdown.length) {
    segments.push({ text: markdown.slice(cursor) });
  }

  return segments;
}
