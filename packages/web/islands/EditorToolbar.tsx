import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { FORMAT_TEXT_COMMAND } from "lexical";
import type { LucideIcon } from "lucide-preact";
import { Bold, Code, Italic, Strikethrough } from "lucide-preact";
import BlockTypeSelect from "@/components/BlockTypeSelect.tsx";
import { $setBlocksType, type BlockType } from "@/editor/blockFormat.ts";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";

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

interface EditorToolbarProps {
  wsId: string;
  path: string;
}

export default function EditorToolbar({ wsId, path }: EditorToolbarProps) {
  const editor = activeEditor.value;
  const sel = getEditorSelection(wsId, path);
  if (editor === null) return null;

  const format = (fmt: FormatType) => {
    editor.focus();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
  };

  const setBlock = (type: BlockType) => {
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
    if (
      type === "normal" &&
      (sel.block.value === "bullet" || sel.block.value === "number")
    ) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.update(() => $setBlocksType(type));
  };

  const inlineDisabled = sel.inCodeBlock.value;

  return (
    <div class="flex stack">
      <BlockTypeSelect block={sel.block.value} onChange={setBlock} />
      {INLINE_BUTTONS.map(({ fmt, tooltip, icon: Icon }) => (
        <button
          type="button"
          class={`btn ${sel[fmt].value ? "btn--accent" : ""}`}
          disabled={inlineDisabled}
          data-tooltip={tooltip}
          onClick={() => format(fmt)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
