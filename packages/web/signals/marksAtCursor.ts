import { signal } from "@preact/signals";

/**
 * Thread ids of the marks at the current caret/selection anchor. Updated by
 * `MarksAtCursorExtension` on every editor update / selection change. Empty
 * when no editor is mounted or the caret is not inside any mark.
 */
export const marksAtCursor = signal<Set<string>>(new Set());
