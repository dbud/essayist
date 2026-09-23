import { TEXT_TYPE_TO_FORMAT } from "lexical";

const { bold, italic, strikethrough, code } = TEXT_TYPE_TO_FORMAT;

export interface PastePolicy {
  allowedBlocks: ReadonlySet<string>;
  allowedHeadingTags: ReadonlySet<string>;
  allowedFormats: number;
}

export const defaultPastePolicy: PastePolicy = {
  allowedBlocks: new Set([
    "paragraph",
    "heading",
    "quote",
    "code",
    "list",
    "listitem",
  ]),
  allowedHeadingTags: new Set(["h1", "h2", "h3"]),
  allowedFormats: bold | italic | strikethrough | code,
};
