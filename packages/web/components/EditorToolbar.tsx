import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { FORMAT_TEXT_COMMAND } from "lexical";
import { Bold, Code, Italic, Strikethrough } from "lucide-preact";
import type { VNode } from "preact";
import BlockTypeSelect from "@/components/BlockTypeSelect.tsx";
import ToolbarButton from "@/components/ToolbarButton.tsx";
import { $setBlocksType, type BlockType } from "@/editor/blockFormat.ts";
import { activeEditor } from "@/signals/activeEditor.ts";
import { useEditorSelection } from "@/signals/editorSelection.ts";

interface EditorToolbarProps {
  path: string;
}

export default function EditorToolbar({ path }: EditorToolbarProps) {
  const editor = activeEditor.value;
  const sel = useEditorSelection(path);
  if (editor === null) return null;

  const format = (fmt: "bold" | "italic" | "strikethrough" | "code") => {
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

  const inlineButtons: {
    fmt: "bold" | "italic" | "strikethrough" | "code";
    title: string;
    icon: VNode;
  }[] = [
    { fmt: "bold", title: "Bold", icon: <Bold size={16} /> },
    { fmt: "italic", title: "Italic", icon: <Italic size={16} /> },
    {
      fmt: "strikethrough",
      title: "Strikethrough",
      icon: <Strikethrough size={16} />,
    },
    { fmt: "code", title: "Inline code", icon: <Code size={16} /> },
  ];

  return (
    <div class="flex items-center gap-1">
      <BlockTypeSelect block={sel.block.value} onChange={setBlock} />
      {inlineButtons.map(({ fmt, title, icon }) => (
        <ToolbarButton
          active={sel[fmt].value}
          disabled={inlineDisabled}
          title={title}
          onClick={() => format(fmt)}
        >
          {icon}
        </ToolbarButton>
      ))}
    </div>
  );
}
