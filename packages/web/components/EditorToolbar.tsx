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
import { toolbarState } from "@/signals/toolbar.ts";

export default function EditorToolbar() {
  const editor = activeEditor.value;
  const state = toolbarState.value;
  if (editor === null || state === null) return null;

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
      (state.block === "bullet" || state.block === "number")
    ) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.update(() => $setBlocksType(type));
  };

  const inlineDisabled = state.inCodeBlock;

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
      <BlockTypeSelect block={state.block} onChange={setBlock} />
      {inlineButtons.map(({ fmt, title, icon }) => (
        <ToolbarButton
          active={state[fmt]}
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
