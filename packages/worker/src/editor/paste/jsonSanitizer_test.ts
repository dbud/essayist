import { assertEquals } from "@std/assert";
import { TEXT_TYPE_TO_FORMAT } from "lexical";
import { test } from "vitest";

import { JsonSanitizer } from "./jsonSanitizer.ts";
import { defaultPastePolicy, type PastePolicy } from "./policy.ts";

const { bold, underline, highlight } = TEXT_TYPE_TO_FORMAT;

const sanitizer = new JsonSanitizer(defaultPastePolicy);

type Node = Record<string, unknown>;

// Fixture builders, matching what exportJSON writes (version included).
function text(text: string, format = 0): Node {
  return {
    type: "text",
    version: 1,
    text,
    format,
    style: "",
    detail: 0,
    mode: "normal",
  };
}

function paragraph(children: Node[]): Node {
  return {
    type: "paragraph",
    version: 1,
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
  };
}

function heading(tag: string, children: Node[]): Node {
  return {
    type: "heading",
    version: 1,
    tag,
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
  };
}

function link(url: string, children: Node[]): Node {
  return {
    type: "link",
    version: 1,
    url,
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
  };
}

test("unwraps marks and masks disallowed formats", () => {
  const result = sanitizer.sanitize([
    {
      ...paragraph([]),
      children: [
        {
          type: "mark",
          ids: ["thread-1"],
          children: [text("hi", bold | highlight)],
        },
      ],
      indent: 2,
    },
  ]);
  assertEquals(result, [paragraph([text("hi", bold)])]);
});

test("clears inline styles", () => {
  const result = sanitizer.sanitize([{ ...text("plain", bold), style: "color:red" }]);
  assertEquals(result, [text("plain", bold)]);
});

test("retypes h4 to a paragraph and drops the tag", () => {
  const result = sanitizer.sanitize([heading("h4", [text("sub")])]);
  assertEquals(result, [paragraph([text("sub")])]);
});

test("keeps allowed heading tags", () => {
  const result = sanitizer.sanitize([heading("h2", [text("top")])]);
  assertEquals(result, [heading("h2", [text("top")])]);
});

test("rewrites links to markdown link text", () => {
  const result = sanitizer.sanitize([link("http://x.com", [text("go", bold)])]);
  assertEquals(result, [
    { type: "text", text: "[" },
    text("go", bold),
    { type: "text", text: "](http://x.com)" },
  ]);
});

test("unwraps links without a url", () => {
  const result = sanitizer.sanitize([{ type: "link", version: 1, children: [text("go")] }]);
  assertEquals(result, [text("go")]);
});

test("writes bare urls for links without a label", () => {
  const result = sanitizer.sanitize([link("http://x.com", [])]);
  assertEquals(result, [{ type: "text", text: "http://x.com" }]);
});

test("rewrites autolinks like links", () => {
  const result = sanitizer.sanitize([
    {
      type: "autolink",
      version: 1,
      url: "http://x.com",
      children: [text("go")],
      direction: null,
      format: "",
      indent: 0,
      textFormat: 0,
      textStyle: "",
    },
  ]);
  assertEquals(result, [
    { type: "text", text: "[" },
    text("go"),
    { type: "text", text: "](http://x.com)" },
  ]);
});

test("drops horizontal rules", () => {
  const result = sanitizer.sanitize([{ type: "horizontalrule" }, text("after")]);
  assertEquals(result, [text("after")]);
});

test("passes through linebreaks and tabs", () => {
  const result = sanitizer.sanitize([{ type: "linebreak" }, { type: "tab" }]);
  assertEquals(result, [{ type: "linebreak" }, { type: "tab" }]);
});

test("hoists unknown containers and drops unknown leaves", () => {
  const result = sanitizer.sanitize([
    { type: "table", children: [{ type: "img", someField: 1 }, text("cell")] },
  ]);
  assertEquals(result, [text("cell")]);
});

test("follows the policy", () => {
  const policy: PastePolicy = {
    allowedBlocks: new Set(["paragraph"]),
    allowedHeadingTags: new Set(["h1"]),
    allowedFormats: bold,
  };
  const result = new JsonSanitizer(policy).sanitize([
    {
      type: "list",
      version: 1,
      listType: "bullet",
      children: [
        {
          type: "listitem",
          version: 1,
          children: [text("item", bold | underline)],
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      textFormat: 0,
      textStyle: "",
    },
  ]);
  assertEquals(result, [text("item", bold)]);
});
