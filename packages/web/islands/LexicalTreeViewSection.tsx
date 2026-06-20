import { TreeView } from "@lexical/react/LexicalTreeView";
import Section from "@/islands/Section.tsx";
import { activeEditor } from "@/signals.ts";

export default function LexicalTreeViewSection() {
  if (!activeEditor.value) return null;
  return (
    <Section title="Lexical Editor">
      <TreeView editor={activeEditor.value} viewClassName="text-xs" />
    </Section>
  );
}
