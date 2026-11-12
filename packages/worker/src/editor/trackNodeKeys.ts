import type { Klass, LexicalEditor, LexicalNode, NodeKey } from "lexical";

// Keeps a live set of the editor's `nodeClass` instances in sync via a mutation listener, so
// measure passes sweep keys instead of walking the whole tree each pass. onChange fires after each
// mutation batch. Returns [keys, dispose].
//
// Skip Lexical's registration seed: it preloads keys from the state at registration, which a
// version switch has already swapped out.
export function trackNodeKeys(
  editor: LexicalEditor,
  nodeClass: Klass<LexicalNode>,
  onChange?: () => void,
): [ReadonlySet<NodeKey>, () => void] {
  const keys = new Set<NodeKey>();
  const dispose = editor.registerMutationListener(
    nodeClass,
    (mutations) => {
      for (const [key, mutation] of mutations) {
        if (mutation === "destroyed") keys.delete(key);
        else keys.add(key);
      }
      onChange?.();
    },
    { skipInitialization: true },
  );
  return [keys, dispose];
}
