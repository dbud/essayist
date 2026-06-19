import { persistentSignal } from "@/utils/persistentSignal.ts";
import { LexicalEditor } from "lexical";
import { signal } from "@preact/signals";

export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");

export const activeEditor = signal<LexicalEditor | null>(null);
