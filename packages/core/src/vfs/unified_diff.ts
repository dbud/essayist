import { type DiffOp, myersDiff } from "@/vfs/diff.ts";

const CONTEXT_LINES = 3;

export function unifiedDiff(
  oldText: string,
  newText: string,
  oldLabel = "a",
  newLabel = "b",
): string {
  if (oldText === "" && newText === "") return "";

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const ops = myersDiff(oldLines, newLines);

  const hunks = buildUnifiedHunks(ops, oldLines, newLines);

  if (hunks.length === 0) return "";

  const lines: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];

  for (const hunk of hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
    );
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }

  return `${lines.join("\n")}\n`;
}

interface UnifiedHunk {
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
  lines: string[];
}

function buildUnifiedHunk(
  ops: DiffOp[],
  oldLines: string[],
  newLines: string[],
  startIdx: number,
): { hunk: UnifiedHunk; nextIdx: number } | null {
  const hunkLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;

  let idx = startIdx;
  while (idx < ops.length && ops[idx].type === "equal") {
    idx++;
  }

  if (idx >= ops.length) {
    return null;
  }

  const changeStart = idx;
  const contextStart = Math.max(0, changeStart - CONTEXT_LINES);

  let changeEnd = changeStart;
  let equalCount = 0;
  for (let i = changeStart; i < ops.length; i++) {
    if (ops[i].type === "equal") {
      equalCount++;
      if (equalCount > CONTEXT_LINES * 2) {
        break;
      }
    } else {
      equalCount = 0;
      changeEnd = i;
    }
  }

  const contextEnd = Math.min(ops.length, changeEnd + CONTEXT_LINES + 1);

  let oldLine = 0;
  let newLine = 0;
  for (let i = 0; i < contextStart; i++) {
    if (ops[i].type !== "insert") oldLine++;
    if (ops[i].type !== "delete") newLine++;
  }

  const hunkOldStart = oldLine + 1;
  const hunkNewStart = newLine + 1;

  for (let i = contextStart; i < contextEnd; i++) {
    const op = ops[i];
    switch (op.type) {
      case "equal":
        hunkLines.push(` ${oldLines[op.oldIdx ?? 0]}`);
        oldCount++;
        newCount++;
        oldLine++;
        newLine++;
        break;
      case "delete":
        hunkLines.push(`-${oldLines[op.oldIdx ?? 0]}`);
        oldCount++;
        oldLine++;
        break;
      case "insert":
        hunkLines.push(`+${newLines[op.newIdx ?? 0]}`);
        newCount++;
        newLine++;
        break;
    }
  }

  return {
    hunk: {
      oldStart: hunkOldStart,
      newStart: hunkNewStart,
      oldCount,
      newCount,
      lines: hunkLines,
    },
    nextIdx: contextEnd,
  };
}

function buildUnifiedHunks(
  ops: DiffOp[],
  oldLines: string[],
  newLines: string[],
): UnifiedHunk[] {
  const hunks: UnifiedHunk[] = [];
  let idx = 0;

  while (idx < ops.length) {
    const result = buildUnifiedHunk(ops, oldLines, newLines, idx);
    if (result === null) break;
    const { hunk, nextIdx } = result;
    hunks.push(hunk);
    idx = nextIdx;
  }

  return hunks;
}
