import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useModel } from "@preact/signals";
import { FORMAT_TEXT_COMMAND } from "lexical";
import type { LucideIcon } from "lucide-preact";
import { Bold, Code, Italic, Strikethrough } from "lucide-preact";

import BlockTypeSelect from "#/components/BlockTypeSelect.tsx";
import { $setBlocksType, type BlockType } from "#/editor/blockFormat.ts";
import type { FileKey } from "#/models/fileSelection.ts";
import { ToolbarModel } from "#/models/toolbarModel.ts";
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

interface EditorToolbarProps extends FileKey {
  disabled?: boolean;
}

export default function EditorToolbar({ wsId, path, versionId, disabled }: EditorToolbarProps) {
  const editor = activeEditor.value;
  const sel = getEditorSelection({ wsId, path, versionId });
  const toolbar = useModel(() => new ToolbarModel(sel));
  const rect = toolbar.display.value.rect;
  if (rect === null) return null;

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

  return (
    <div
      class="absolute"
      style={{
        left: `${rect.left}px`,
        top: `${rect.top + rect.height + CARET_GAP_PX}px`,
      }}
    >
      <div class="flex items-center gap-2">
        <BlockTypeSelect block={sel.block.value} onChange={setBlock} disabled={disabled} />
        {INLINE_BUTTONS.map(({ fmt, tooltip, icon: Icon }) => (
          <button
            type="button"
            class={`aq-melt ${sel[fmt].value ? "aq-btn--accent" : "aq-btn"}`}
            disabled={inlineDisabled}
            data-tooltip={tooltip}
            onClick={() => format(fmt)}
          >
            <Icon />
          </button>
        ))}
      </div>
    </div>
  );
}
