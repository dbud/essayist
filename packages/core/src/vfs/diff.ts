import { createTokenizer, type Token } from "@/vfs/text_utils.ts";

export interface DiffHunk {
  type: "insert" | "delete" | "replace";
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldText: string;
  newText: string;
}

// The \s+ alternative captures leading whitespace; without it \S+\s*
// would skip it and leading-whitespace changes would be invisible to the
// diff. Punctuation stays attached to the word.
const DIFF_TOKEN_REGEX = /(\s+)|(\S+\s*)/g;

const tokenize = createTokenizer(DIFF_TOKEN_REGEX);

/**
 * Compute a token-level diff between two texts.
 *
 * Uses Myers' LCS algorithm on word tokens, then maps back
 * to character offsets in the original texts.
 */
export function computeDiff(oldText: string, newText: string): DiffHunk[] {
  if (oldText === "" && newText === "") return [];
  if (oldText === "") {
    return [
      {
        type: "insert",
        oldStart: 0,
        oldEnd: 0,
        newStart: 0,
        newEnd: newText.length,
        oldText: "",
        newText,
      },
    ];
  }
  if (newText === "") {
    return [
      {
        type: "delete",
        oldStart: 0,
        oldEnd: oldText.length,
        newStart: 0,
        newEnd: 0,
        oldText,
        newText: "",
      },
    ];
  }
  if (oldText === newText) return [];

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const ops = myersDiff(oldTokens, newTokens);
  return buildHunks(ops, oldTokens, newTokens, oldText, newText);
}

interface DiffOp {
  type: "equal" | "insert" | "delete";
  oldIdx?: number;
  newIdx?: number;
}

function myersDiff(oldTokens: Token[], newTokens: Token[]): DiffOp[] {
  const N = oldTokens.length;
  const M = newTokens.length;

  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0),
  );

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (oldTokens[i - 1].text === newTokens[j - 1].text) {
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
    if (i > 0 && j > 0 && oldTokens[i - 1].text === newTokens[j - 1].text) {
      ops.push({ type: "equal", oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "insert", newIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: "delete", oldIdx: i - 1 });
      i--;
    }
  }

  ops.reverse();
  return ops;
}

function buildHunks(
  ops: DiffOp[],
  oldTokens: Token[],
  newTokens: Token[],
  oldText: string,
  newText: string,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < ops.length) {
    // Skip equal ops; if nothing remains, done
    while (i < ops.length && ops[i].type === "equal") i++;
    if (i >= ops.length) break;

    // Collect a run of non-equal ops
    const changeStart = i;
    while (i < ops.length && ops[i].type !== "equal") i++;

    let oldStart = Infinity;
    let oldEnd = 0;
    let newStart = Infinity;
    let newEnd = 0;

    for (let j = changeStart; j < i; j++) {
      const op = ops[j];
      if (op.type === "delete" && op.oldIdx !== undefined) {
        const t = oldTokens[op.oldIdx];
        oldStart = Math.min(oldStart, t.offset);
        oldEnd = Math.max(oldEnd, t.endOffset);
      } else if (op.type === "insert" && op.newIdx !== undefined) {
        const t = newTokens[op.newIdx];
        newStart = Math.min(newStart, t.offset);
        newEnd = Math.max(newEnd, t.endOffset);
      }
    }

    if (oldStart === Infinity) {
      oldStart = oldEnd =
        // biome-ignore lint:style:noNonNullAssertion
        changeStart > 0 ? oldTokens[ops[changeStart - 1].oldIdx!].endOffset : 0;
    }
    if (newStart === Infinity) {
      newStart = newEnd =
        // biome-ignore lint:style:noNonNullAssertion
        changeStart > 0 ? newTokens[ops[changeStart - 1].newIdx!].endOffset : 0;
    }

    const oldSlice = oldText.slice(oldStart, oldEnd);
    const newSlice = newText.slice(newStart, newEnd);

    let type: DiffHunk["type"];
    if (oldSlice === "" && newSlice !== "") type = "insert";
    else if (oldSlice !== "" && newSlice === "") type = "delete";
    else type = "replace";

    hunks.push({
      type,
      oldStart,
      oldEnd,
      newStart,
      newEnd,
      oldText: oldSlice,
      newText: newSlice,
    });
  }

  return hunks;
}
