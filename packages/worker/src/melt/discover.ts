/** The class of a group root, which the Melt component renders. */
export const MELT_ROOT = "melt-root";

export interface ShapeNode {
  readonly element: HTMLElement;
  /** As in MeasuredShape. */
  readonly group: number;
}

/** Finds the shapes under a root with the MELT_ROOT class, the root included, in document order.
    The root starts group 0, and every element marked by the melt-group utility under it starts a
    group of its own. */
export function findShapes(root: HTMLElement): ShapeNode[] {
  const groups = new Map<Element, number>([[root, 0]]);
  const nodes: ShapeNode[] = [];
  for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    // A root inside this one draws its own shapes.
    if (element.closest(`.${MELT_ROOT}`) !== root) continue;
    const style = getComputedStyle(element);
    if (element !== root && marked(style, "--melt-group")) groups.set(element, groups.size);
    if (marked(style, "--melt-shape")) {
      nodes.push({ element, group: closestGroup(element, groups) });
    }
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

function marked(style: CSSStyleDeclaration, property: string): boolean {
  return style.getPropertyValue(property).trim() === "1";
}

function closestGroup(element: Element, groups: Map<Element, number>): number {
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const group = groups.get(current);
    if (group !== undefined) return group;
  }
  return 0;
}
