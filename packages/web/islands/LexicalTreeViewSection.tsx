import { TreeView } from "@lexical/react/LexicalTreeView";
import Section from "@/islands/Section.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";

export default function LexicalTreeViewSection() {
  if (!activeEditor.value) return null;
  return (
    <Section title="Lexical Editor">
      <TreeView
        editor={activeEditor.value}
        viewClassName="font-mono p-1 wrap-break-word text-[0.6rem]"
      />
    </Section>
  );
}
