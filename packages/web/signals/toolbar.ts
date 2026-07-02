import { signal } from "@preact/signals";
import type { BlockType } from "@/editor/blockFormat.ts";

export interface ToolbarState {
  block: BlockType;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  inCodeBlock: boolean;
}

export const toolbarState = signal<ToolbarState | null>(null);
