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
 * Uses Myers' O((N+M)*D) shortest-edit-script algorithm on word tokens, then
 * maps the edit script back to character offsets in the original texts. D is
 * the edit distance (insertions + deletions); for a small edit in a long
 * document D is tiny and this is far faster than an O(N*M) LCS DP table.
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
  const n = oldTokens.length;
  const m = newTokens.length;
  if (n === 0 && m === 0) return [];
  if (n === 0)
    return newTokens.map((_, j) => ({ type: "insert", newIdx: j }) as DiffOp);
  if (m === 0)
    return oldTokens.map((_, i) => ({ type: "delete", oldIdx: i }) as DiffOp);

  // Myers' O((N+M)*D) shortest-edit-script, where D is the edit distance
  // (number of insertions + deletions).
  //
  // We search the edit graph of oldTokens (x axis, 0..n) against newTokens
  // (y axis, 0..m). A diagonal k = x - y groups all points whose x-y is
  // constant; advancing along a diagonal (x+1, y+1) is a free match on a
  // common token, while stepping right (x+1, y) is a deletion and stepping
  // down (x, y+1) is an insertion. Each D iteration reaches points that need
  // exactly D edits; the answer is the smallest D that reaches (n, m).
  //
  // v[k + offset] holds the furthest x reached on diagonal k so far. k can
  // be negative, so we offset by `max` to keep indices non-negative. The
  // trace snapshots v at the start of each D iteration so we can backtrack
  // the edit script once (n, m) is reached. On ties (v[k+1] == v[k-1]) we
  // prefer the down/insert edge, which keeps insertions before deletions in
  // a run of adjacent edits.
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1).fill(-1);
  v[offset + 1] = 0;
  const trace: Int32Array[] = [];

  let finalD = -1;
  for (let d = 0; d <= max; d++) {
    // Snapshot the relevant slice [-d, d] of v for backtracking.
    trace.push(v.subarray(offset - d, offset + d + 1).slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k + 1] > v[offset + k - 1])) {
        x = v[offset + k + 1]; // down (insert)
      } else {
        x = v[offset + k - 1] + 1; // right (delete)
      }
      let y = x - k;
      while (x < n && y < m && oldTokens[x].text === newTokens[y].text) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        finalD = d;
        break;
      }
    }
    if (finalD !== -1) break;
  }
  if (finalD === -1) finalD = max; // defensive; should not happen

  // Backtrack from (n, m) to (0, 0) using the trace.
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = finalD; d > 0; d--) {
    const snap = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && snap[k + 1 + d] > snap[k - 1 + d])) {
      prevK = k + 1; // came from above (insert)
    } else {
      prevK = k - 1; // came from the left (delete)
    }
    const prevX = snap[prevK + d];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: "equal", oldIdx: x - 1, newIdx: y - 1 });
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push({ type: "insert", newIdx: y - 1 });
      y--;
    } else {
      ops.push({ type: "delete", oldIdx: x - 1 });
      x--;
    }
  }
  // Remaining leading diagonal (D = 0): pure matches from (x, y) to (0, 0).
  while (x > 0 && y > 0) {
    ops.push({ type: "equal", oldIdx: x - 1, newIdx: y - 1 });
    x--;
    y--;
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
