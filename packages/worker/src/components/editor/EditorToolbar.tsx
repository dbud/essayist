import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useModel, useSignal } from "@preact/signals";
import { FORMAT_TEXT_COMMAND } from "lexical";
import type { LucideIcon } from "lucide-preact";
import { Bold, Code, Italic, Strikethrough } from "lucide-preact";
import { useLayoutEffect } from "preact/hooks";

import BlockTypeSelect from "#/components/BlockTypeSelect.tsx";
import Melt from "#/components/ui/Melt.tsx";
import { $setBlocksType, type BlockType } from "#/editor/blockFormat.ts";
import type { VersionKey } from "#/models/fileSelection.ts";
import { type ToolbarDisplay, ToolbarModel } from "#/models/toolbarModel.ts";
import { activeEditor } from "#/signals/activeEditor.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

type FormatType = "bold" | "italic" | "strikethrough" | "code";

interface InlineButton {
  fmt: FormatType;
  tooltip: string;
  icon: LucideIcon;
}

const INLINE_BUTTONS: InlineButton[] = [
  { fmt: "bold", tooltip: "Bold", icon: Bold },
  { fmt: "italic", tooltip: "Emphasis", icon: Italic },
  { fmt: "strikethrough", tooltip: "Strikethrough", icon: Strikethrough },
  { fmt: "code", tooltip: "Monospaced / code", icon: Code },
];

const CARET_GAP_PX = 6;

interface EditorToolbarProps extends VersionKey {
  disabled?: boolean;
}

export default function EditorToolbar({ wsId, fileId, versionId, disabled }: EditorToolbarProps) {
  const editor = activeEditor.value;
  const sel = getEditorSelection({ wsId, fileId, versionId });
  const toolbar = useModel(() => new ToolbarModel(sel));
  const current = toolbar.display.value;
  const held = useSignal<ToolbarDisplay | null>(null);
  useLayoutEffect(() => {
    if (current !== null) held.value = current;
  });
  const shown = current !== null && !disabled;
  const view = current ?? held.value;
  if (view === null) return null;
  const { mode, rect } = view;

  const format = (fmt: FormatType) => {
    if (!editor) return;
    editor.focus();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
  };

  const setBlock = (type: BlockType) => {
    if (!editor) return;
    editor.focus();
    if (type === "bullet") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
    }
    if (type === "number") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    // Leaving a list for "normal": Lexical's list command unwraps the items.
    if (type === "normal" && (sel.block.value === "bullet" || sel.block.value === "number")) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.update(() => $setBlocksType(type));
  };

  const inlineDisabled = disabled || editor === null || sel.inCodeBlock.value;
  const left = rect.left;
  const top = rect.above ? rect.top - CARET_GAP_PX : rect.top + rect.height + CARET_GAP_PX;

  return (
    <div
      class={`floating-toolbar absolute z-panel${shown ? " is-open" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      style={{ left, top }}
    >
      <div class={`flex items-center gap-2${rect.above ? " -translate-y-full" : ""}`}>
        <BlockTypeSelect block={sel.block.value} onChange={setBlock} disabled={disabled} />
        {mode === "selection" &&
          INLINE_BUTTONS.map(({ fmt, tooltip, icon: Icon }) => (
            <Melt class="-translate-y-px">
              <button
                type="button"
                class={`btn btn--small ${sel[fmt].value ? "btn--accent" : "btn--solid"}`}
                disabled={inlineDisabled}
                data-tooltip={tooltip}
                onClick={() => format(fmt)}
              >
                <Icon />
              </button>
            </Melt>
          ))}
      </div>
    </div>
  );
}
