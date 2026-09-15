import type { Category } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { ColorSwatch } from "@/components/highlights/ColorSwatch.tsx";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { CheckboxIcon } from "@/components/ui/icons.tsx";
import Slider from "@/components/ui/Slider.tsx";
import { FALLBACK_COLOR } from "@/editor/markColors.ts";
import { type CategoryInput, getAdminConfig } from "@/signals/admin.ts";

// Canonical stored form: oklch(<L>% <C> <H>).
const OKLCH_RE = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/;
const DEFAULTS = { l: 65, c: 0.4, h: 90 };

function parseOklch(color: string | undefined) {
  const m = color?.match(OKLCH_RE);
  return m
    ? { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) }
    : { ...DEFAULTS };
}

export function CategoryForm({
  entity,
  open,
}: {
  entity?: Category;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const initial = parseOklch(entity?.color);
  const [label, setLabel] = useState(entity?.label ?? "");
  const [severity, setSeverity] = useState(entity?.severity ?? "");
  const [colorEnabled, setColorEnabled] = useState(entity?.color !== undefined);
  const [l, setL] = useState(initial.l);
  const [c, setC] = useState(initial.c);
  const [h, setH] = useState(initial.h);
  const [description, setDescription] = useState(entity?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const canonical = `oklch(${Math.round(l)}% ${Number(c.toFixed(2))} ${Math.round(h)})`;
  const previewColor = colorEnabled ? canonical : FALLBACK_COLOR;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!label.trim()) return setError("Label is required.");
    const data: CategoryInput = {
      label: label.trim(),
      ...(severity.trim() ? { severity: severity.trim() } : {}),
      ...(colorEnabled ? { color: canonical } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const ok = entity
      ? await admin.updateCategory(entity.id, data)
      : await admin.createCategory(data);
    if (ok) open.value = false;
  }

  return (
    <FormShell
      title={entity ? "Edit category" : "New category"}
      submitLabel={entity ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextRow label="label" value={label} onInput={setLabel} />
      <TextRow label="severity" value={severity} onInput={setSeverity} />
      <span class="cell">color</span>
      <button
        type="button"
        class="btn w-full"
        onClick={() => setColorEnabled((v) => !v)}
      >
        <CheckboxIcon selected={colorEnabled} size={15} />
        <span>custom color</span>
      </button>
      {colorEnabled && (
        <>
          <Slider
            class="cell col-span-2"
            label="lightness"
            value={l}
            min={0}
            max={100}
            step={1}
            onChange={setL}
            format={(v) => `${v}%`}
          />
          <Slider
            class="cell col-span-2"
            label="chroma"
            value={c}
            min={0}
            max={0.5}
            step={0.01}
            onChange={setC}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            class="cell col-span-2"
            label="hue"
            value={h}
            min={0}
            max={360}
            step={1}
            onChange={setH}
          />
        </>
      )}
      <span class="cell">preview</span>
      <div class="cell w-full gap-2">
        <ColorSwatch color={previewColor} />
        <span class="min-w-0 truncate font-mono text-xs text-ink/60">
          {colorEnabled ? canonical : "fallback"}
        </span>
      </div>
      <TextareaRow
        label="description"
        value={description}
        onInput={setDescription}
        rows={4}
      />
    </FormShell>
  );
}
