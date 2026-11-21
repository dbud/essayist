export interface ShapeNode {
  readonly element: HTMLElement;
  /** As in MeasuredShape. */
  readonly parent: number;
}

/** Finds the shapes of a group, the root included, in document order. */
export function findShapes(root: HTMLElement): ShapeNode[] {
  const indices = new Map<Element, number>();
  const nodes: ShapeNode[] = [];
  for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    if (getComputedStyle(element).getPropertyValue("--melt-shape").trim() !== "1") continue;
    indices.set(element, nodes.length);
    nodes.push({ element, parent: closestShape(element, root, indices) });
  }
  return nodes;
}

/** Calls onChange with the shapes now, and again whenever the elements or classes under the root
    change. Returns a function to stop watching. */
export function watchShapes(root: HTMLElement, onChange: (nodes: ShapeNode[]) => void): () => void {
  onChange(findShapes(root));
  const observer = new MutationObserver(() => onChange(findShapes(root)));
  observer.observe(root, { childList: true, subtree: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function closestShape(element: Element, root: Element, indices: Map<Element, number>): number {
  if (element === root) return -1;
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const index = indices.get(parent);
    if (index !== undefined) return index;
    if (parent === root) break;
  }
  return -1;
}
