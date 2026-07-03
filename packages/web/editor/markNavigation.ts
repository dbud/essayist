import { $isMarkNode } from "@lexical/mark";
import { $getNodeByKey, type LexicalEditor } from "lexical";
import { getMarkNodeKey } from "./markNodeRegistry.ts";

/**
 * Places the caret at the start of the mark `threadId` in the editor (and
 * focuses it, which scrolls the caret into view). No-op if the mark isn't
 * currently applied to the tree. Looks up the mark via the live MarkNode-key
 * set maintained by `MarksExtension` (no full tree walk).
 */
export function selectMark(editor: LexicalEditor, threadId: string): void {
  const key = getMarkNodeKey(editor, threadId);
  if (key === null) return;

  editor.focus();
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node !== null && $isMarkNode(node)) node.selectStart();
  });
}
