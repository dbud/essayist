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

function myersDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const N = oldLines.length;
  const M = newLines.length;

  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0),
  );

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = N,
    j = M;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({
        type: "equal",
        oldLine: oldLines[i - 1],
        newLine: newLines[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "insert", newLine: newLines[j - 1] });
      j--;
    } else {
      ops.push({ type: "delete", oldLine: oldLines[i - 1] });
      i--;
    }
  }

  ops.reverse();
  return ops;
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
