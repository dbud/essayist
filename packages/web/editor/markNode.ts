import {
  $isMarkNode,
  MarkNode as BaseMarkNode,
  type SerializedMarkNode,
} from "@lexical/mark";
import {
  $applyNodeReplacement,
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  type EditorConfig,
  type LexicalNode,
  type RangeSelection,
} from "lexical";

/** MarkNode ids on the selection anchor's ancestor chain (empty when unset). */
export function $markIdsAtAnchor(): Set<string> {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return new Set();

  const ids = new Set<string>();
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node !== null) {
    const mark: BaseMarkNode | null = $findMatchingParent(node, $isMarkNode);
    if (mark === null) break;
    for (const id of mark.getIDs()) ids.add(id);
    node = mark.getParent();
  }
  return ids;
}

const NO_IDS: readonly string[] = [];

// Adds `mark-active` in createDOM; a listener would run after
// $updateDOMSelection forces a style recalc and trigger the transition.
export class MarkNode extends BaseMarkNode {
  static override getType(): string {
    return "mark";
  }

  static override clone(node: MarkNode): MarkNode {
    return new MarkNode(node.__ids, node.__key);
  }

  static override importJSON(serializedNode: SerializedMarkNode): MarkNode {
    return $createMarkNode().updateFromJSON(serializedNode);
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const el = super.createDOM(config);
    if (this.getIDs().some((id) => $markIdsAtAnchor().has(id))) {
      el.classList.add("mark-active");
    }
    return el;
  }

  override insertNewAfter(
    _selection: RangeSelection,
    restoreSelection = true,
  ): MarkNode {
    const markNode = $createMarkNode(this.__ids);
    this.insertAfter(markNode, restoreSelection);
    return markNode;
  }
}

export function $createMarkNode(ids: readonly string[] = NO_IDS): MarkNode {
  return $applyNodeReplacement(new MarkNode(ids));
}
