import { myersDiff } from "@/vfs/diff.ts";

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

  const ops = lineOps(oldLines, newLines);

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

interface DiffOp {
  type: "equal" | "insert" | "delete";
  oldLine?: string;
  newLine?: string;
}

interface UnifiedHunk {
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
  lines: string[];
}

function lineOps(oldLines: string[], newLines: string[]): DiffOp[] {
  return myersDiff(oldLines, newLines).map((op): DiffOp => {
    if (op.type === "equal") {
      return {
        type: "equal",
        oldLine: oldLines[op.oldIdx ?? 0],
        newLine: newLines[op.newIdx ?? 0],
      };
    }
    if (op.type === "insert") {
      return { type: "insert", newLine: newLines[op.newIdx ?? 0] };
    }
    return { type: "delete", oldLine: oldLines[op.oldIdx ?? 0] };
  });
}

function buildUnifiedHunk(
  ops: DiffOp[],
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
        hunkLines.push(` ${op.oldLine}`);
        oldCount++;
        newCount++;
        oldLine++;
        newLine++;
        break;
      case "delete":
        hunkLines.push(`-${op.oldLine}`);
        oldCount++;
        oldLine++;
        break;
      case "insert":
        hunkLines.push(`+${op.newLine}`);
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
  _oldLines: string[],
  _newLines: string[],
): UnifiedHunk[] {
  const hunks: UnifiedHunk[] = [];
  let idx = 0;

  while (idx < ops.length) {
    const result = buildUnifiedHunk(ops, idx);
    if (result === null) break;
    const { hunk, nextIdx } = result;
    hunks.push(hunk);
    idx = nextIdx;
  }

  return hunks;
}
