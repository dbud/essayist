import { LexicalEditor } from "lexical";
import { signal } from "@preact/signals";

export const activeEditor = signal<LexicalEditor | null>(null);
