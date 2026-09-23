import { filterEntries } from "@std/collections";
import DOMPurify from "dompurify";
import { TEXT_TYPE_TO_FORMAT } from "lexical";
import type { PastePolicy } from "./policy.ts";

const BLOCK_HTML_TAGS = {
  paragraph: ["p"],
  quote: ["blockquote"],
  code: ["pre"],
  list: ["ul", "ol", "li"],
};

const FORMAT_HTML_TAGS = {
  bold: ["strong", "b"],
  italic: ["em", "i"],
  strikethrough: ["s"],
  code: ["code"],
};

export class HtmlSanitizer {
  readonly #policy: PastePolicy;

  constructor(policy: PastePolicy) {
    this.#policy = policy;
  }

  sanitize(html: string): Document {
    const dom = new DOMParser().parseFromString(html, "text/html");
    transformPastedHtml(dom.body, dom);
    const clean = DOMPurify(window).sanitize(dom.body.innerHTML, {
      ALLOWED_TAGS: this.#allowedTags(),
      ALLOWED_ATTR: ["class"],
    });
    // Reparse as a full document: a fragment would leave top-level text
    // nodes without an element parent, which breaks Lexical's DOM import.
    return new DOMParser().parseFromString(clean, "text/html");
  }

  #allowedTags(): string[] {
    const blocks = filterEntries(BLOCK_HTML_TAGS, ([block]) =>
      this.#policy.allowedBlocks.has(block),
    );
    const formats = filterEntries(
      FORMAT_HTML_TAGS,
      ([format]) =>
        (this.#policy.allowedFormats & TEXT_TYPE_TO_FORMAT[format]) !== 0,
    );
    return [
      "br",
      ...(this.#policy.allowedBlocks.has("heading")
        ? [...this.#policy.allowedHeadingTags]
        : []),
      ...Object.values(blocks).flat(),
      ...Object.values(formats).flat(),
    ];
  }
}

// Lexical maps <s> to strikethrough but has no converter for <del> or
// <strike>, so they are renamed before the allowlist runs. Anchors become
// literal GitHub-style markdown link text, e.g. [label](https://example.com),
// so pasted links stay plain text.
export function transformPastedHtml(body: ParentNode, doc: Document): void {
  for (const el of body.querySelectorAll("del, strike")) {
    const renamed = doc.createElement("s");
    renamed.append(...el.childNodes);
    el.replaceWith(renamed);
  }
  for (const el of body.querySelectorAll("a")) {
    const href = el.getAttribute("href");
    if (!href) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    if (!el.textContent?.trim()) {
      el.replaceWith(doc.createTextNode(href));
      continue;
    }
    el.replaceWith(
      doc.createTextNode("["),
      ...el.childNodes,
      doc.createTextNode(`](${href})`),
    );
  }
}
