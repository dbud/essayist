import type { Mark } from "@essayist/core";
import { segmentMarks } from "@/editor/markSegments.ts";
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
  marks: Mark[];
}

const AMBER_BY_COUNT: Record<number, string> = {
  1: "bg-amber-200",
  2: "bg-amber-300",
  3: "bg-amber-400",
  4: "bg-amber-500",
  5: "bg-amber-600",
  6: "bg-amber-700",
  7: "bg-amber-800",
  8: "bg-amber-900",
};

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
      <pre class="text-ink font-mono text-[0.7rem] whitespace-pre-wrap break-words bg-paper p-2 rounded">
        {segments.map((seg, i) => {
          if (seg.marks.length === 0) {
            return <span key={i}>{visualizeWhitespace(seg.text)}</span>;
          }
          const title = seg.marks
            .map((m) => (m.label ? `${m.label}: ${m.comment}` : m.comment))
            .join(" | ");
          const cls = AMBER_BY_COUNT[Math.min(seg.marks.length, 8)] ?? "";
          return (
            <span key={i} class={cls} title={title}>
              {seg.text ? visualizeWhitespace(seg.text) : "\u250A"}
            </span>
          );
        })}
      </pre>
      {stale.length > 0 && (
        <div class="mt-2 text-xs">
          <div class="font-semibold text-ink/70 mb-1">Stale Marks</div>
          <ul class="flex flex-col gap-1">
            {stale.map((mark) => (
              <li key={mark.id} class="text-ink/60">
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

/**
 * Splits the markdown into a gap/marked segment list, using `segmentMarks` so
 * overlapping/nested marks produce one segment carrying every covering mark
 * (mirroring the editor's multi-id MarkNodes). Zero-length marks (which
 * `segmentMarks` drops) are kept as point segments rendered as a marker glyph.
 */
function buildSegments(markdown: string, marks: Mark[]): TextSegment[] {
  if (marks.length === 0) return [{ text: markdown, marks: [] }];

  const byThread = new Map(marks.map((m) => [m.thread_id, m]));
  const resolve = (ids: readonly string[]): Mark[] =>
    ids.map((id) => byThread.get(id)).filter((m): m is Mark => m !== undefined);

  // Non-zero marks -> non-overlapping intervals via segmentMarks; zero-length
  // marks -> point intervals at their offset. Merge by offset and walk with a
  // cursor, emitting gap segments between.
  const intervals = segmentMarks(marks.filter((m) => m.length > 0)).map(
    ({ offset, length, ids }) => ({ offset, length, marks: resolve(ids) }),
  );
  const points = marks
    .filter((m) => m.length === 0)
    .map((m) => ({ offset: m.offset, length: 0, marks: [m] }));
  const anchored = [...intervals, ...points].sort(
    (a, b) => a.offset - b.offset,
  );

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const seg of anchored) {
    if (seg.offset > cursor) {
      segments.push({ text: markdown.slice(cursor, seg.offset), marks: [] });
    }
    segments.push({
      text: markdown.slice(seg.offset, seg.offset + seg.length),
      marks: seg.marks,
    });
    cursor = Math.max(cursor, seg.offset + seg.length);
  }
  if (cursor < markdown.length) {
    segments.push({ text: markdown.slice(cursor), marks: [] });
  }
  return segments;
}
