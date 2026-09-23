import type { SerializedLinkNode } from "@lexical/link";
import type { SerializedHeadingNode } from "@lexical/rich-text";
import type {
  ElementFormatType,
  SerializedElementNode,
  SerializedTextNode,
} from "lexical";
import type { PastePolicy } from "./policy.ts";

// The payload shape for the fields the sanitizer reads, composed from
// Lexical's serialized node types. Partial because compact exports omit
// default values and payloads are untrusted. `format` is unioned because
// TextNode serializes a bitmask and ElementNode an alignment string;
// `children` is re-anchored to this recursive type. Unknown extra fields
// (language, listType, ...) survive the spread untyped.
type SerializedNode = Omit<Partial<SerializedTextNode>, "format"> &
  Omit<Partial<SerializedElementNode>, "children" | "format"> &
  Partial<Pick<SerializedHeadingNode, "tag">> &
  Partial<Pick<SerializedLinkNode, "url">> & {
    children?: SerializedNode[];
    format?: number | ElementFormatType;
    type: string;
  };

export class JsonSanitizer {
  readonly #policy: PastePolicy;

  constructor(policy: PastePolicy) {
    this.#policy = policy;
  }

  sanitize(nodes: unknown[]): SerializedNode[] {
    return nodes.flatMap((node) => this.#sanitizeNode(node));
  }

  #sanitizeNode(node: unknown): SerializedNode[] {
    if (typeof node !== "object" || node === null) return [];
    const record = node as SerializedNode;
    switch (record.type) {
      case "text":
        return [this.#sanitizeText(record)];
      case "linebreak":
      case "tab":
        return [record];
      case "horizontalrule":
        return [];
      case "link":
      case "autolink":
        return this.#linkToMarkdownText(record);
      case "heading": {
        const tag = typeof record.tag === "string" ? record.tag : "h1";
        const element = this.#policy.allowedHeadingTags.has(tag)
          ? record
          : { ...record, type: "paragraph", tag: undefined };
        return [this.#sanitizeElement(element)];
      }
      default:
        if (this.#policy.allowedBlocks.has(record.type)) {
          return [this.#sanitizeElement(record)];
        }
        // Marks and unknown types: hoist children, drop leaf nodes.
        return this.#children(record);
    }
  }

  #sanitizeText(record: SerializedNode): SerializedNode {
    return {
      ...record,
      format:
        typeof record.format === "number"
          ? record.format & this.#policy.allowedFormats
          : record.format,
      style: "",
    };
  }

  #sanitizeElement(record: SerializedNode): SerializedNode {
    return {
      ...record,
      children: this.#children(record),
      direction: null,
      format: "",
      indent: 0,
      textFormat: 0,
      textStyle: "",
    };
  }

  #children(record: SerializedNode): SerializedNode[] {
    if (!Array.isArray(record.children)) return [];
    return record.children.flatMap((child) => this.#sanitizeNode(child));
  }

  #linkToMarkdownText(record: SerializedNode): SerializedNode[] {
    const url = typeof record.url === "string" ? record.url : "";
    if (!url) return this.#children(record);
    const children = this.#children(record);
    if (children.length === 0) return [{ type: "text", text: url }];
    return [
      { type: "text", text: "[" },
      ...children,
      { type: "text", text: `](${url})` },
    ];
  }
}
