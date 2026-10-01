export type TextPart = string | string[] | false | undefined;

/**
 * Join blocks on blank lines, dropping empty blocks.
 * Use for paragraph-level composition.
 */
export function joinBlocks(...parts: TextPart[]): string {
  return parts
    .flat()
    .filter((part) => typeof part === "string" && part.length > 0)
    .join("\n\n");
}

/**
 * Join lines, dropping undelivered parts but keeping empty strings, which
 * act as blank separator lines.
 */
export function joinLines(...parts: TextPart[]): string {
  return parts
    .flat()
    .filter((part) => typeof part === "string")
    .join("\n");
}

/** A `##` header line. */
export function section(header: string): string {
  return `## ${header}`;
}

/** Bulleted items on separate lines. */
export function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export interface ListOptions {
  /** Prefix items with their 1-based position instead of a bullet. */
  numbered?: boolean;
}

/** A `##`-headered list of items, or undefined when empty. */
export function listOf(
  header: string,
  items: string[],
  options?: ListOptions,
): string | undefined {
  return items.length > 0
    ? joinBlocks([section(header), renderItems(items, options)])
    : undefined;
}

function renderItems(items: string[], options?: ListOptions): string {
  return options?.numbered
    ? items.map((item, i) => `${i + 1}. ${item}`).join("\n")
    : bulletList(items);
}
