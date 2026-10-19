import { signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";

export const activeEditor = signal<LexicalEditor | null>(null);
