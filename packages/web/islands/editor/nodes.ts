import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
// TODO: ↓ is deprecated, use extensions
// import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";

export const nodes = [
  HeadingNode,
  LinkNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  // HorizontalRuleNode,
];
