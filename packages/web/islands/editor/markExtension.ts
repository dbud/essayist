import { defineExtension } from "@lexical/extension";
import { MarkNode } from "@lexical/mark";
import { type LexicalEditor, mergeRegister } from "lexical";

export const MarksExtension = defineExtension({
  name: "mark",
  nodes: () => [MarkNode],
  register: (editor: LexicalEditor) =>
    mergeRegister(
      editor.registerMutationListener(MarkNode, (nodes, payload) => {
        console.log("MarkNode mutation", nodes, payload);
      }),
    ),
});
