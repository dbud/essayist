import { measure } from "@/measure.ts";
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

// Two interchangeable Myers implementations share the encode/decode boundary
// (tokens -> integer ids -> flat op Int32Array -> DiffOp[]): the pure-JS
// `jsMyers` (default) and a faster Rust one injected via `setMyers`.
// `diff.ts` never imports the Rust crate, so the browser bundle only pulls in
// the wasm glue when it's explicitly enabled.
export type MyersFn = (
  oldTokenIds: Int32Array,
  newTokenIds: Int32Array,
) => Int32Array;

let myersFn: MyersFn = jsMyers;

/** Install the Myers fn (defaults to `jsMyers`). */
export function setMyers(fn: MyersFn): void {
  myersFn = fn;
}

/** Compute a token-level diff between two texts. */
export function computeDiff(oldText: string, newText: string): DiffHunk[] {
  return computeDiffWith(oldText, newText, myersFn);
}

/** Compute a token-level diff with an explicit Myers fn. */
export function computeDiffWith(
  oldText: string,
  newText: string,
  fn: MyersFn,
): DiffHunk[] {
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

  const oldTokens = measure(() => tokenize(oldText), "tokenize.old");
  const newTokens = measure(() => tokenize(newText), "tokenize.new");

  const ops = measure(() => myersDiff(fn, oldTokens, newTokens), "myers");
  const hunks = measure(
    () => buildHunks(ops, oldTokens, newTokens, oldText, newText),
    "buildHunks",
  );
  return hunks;
}

interface DiffOp {
  type: "equal" | "insert" | "delete";
  oldIdx?: number;
  newIdx?: number;
}

// Each distinct token text maps to one integer id shared across old/new so the
// core compares ids with `==` (equivalent to `oldTokens[x].text ===
// newTokens[y].text`). The core returns a flat Int32Array of
// `[type, oldIdx, newIdx, ...]` triples where type is 0=equal, 1=insert,
// 2=delete (matching `DiffOp.type`); the unused index is -1.

const EQ = 0;
const INS = 1;
const DEL = 2;

/** Assign integer ids to tokens, deduping identical text to the same id. */
function assignTokenIds(
  oldTokens: Token[],
  newTokens: Token[],
): { oldIds: Int32Array; newIds: Int32Array } {
  const map = new Map<string, number>();
  let nextId = 0;
  const oldIds = new Int32Array(oldTokens.length);
  const newIds = new Int32Array(newTokens.length);

  for (const [tokens, ids] of [
    [oldTokens, oldIds],
    [newTokens, newIds],
  ] as [Token[], Int32Array][]) {
    for (let i = 0; i < tokens.length; i++) {
      const text = tokens[i].text;
      let id = map.get(text);
      if (id === undefined) {
        id = nextId++;
        map.set(text, id);
      }
      ids[i] = id;
    }
  }
  return { oldIds, newIds };
}

/** Translate the flat op Int32Array back into `DiffOp[]`. */
function decodeOps(flat: Int32Array): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    const type = flat[i];
    const oldIdx = flat[i + 1];
    const newIdx = flat[i + 2];
    if (type === EQ) {
      ops.push({ type: "equal", oldIdx, newIdx });
    } else if (type === INS) {
      ops.push({ type: "insert", newIdx });
    } else if (type === DEL) {
      ops.push({ type: "delete", oldIdx });
    } else {
      throw new Error(`decodeOps: unknown op type ${type}`);
    }
  }
  return ops;
}

/** Encode tokens to ids, run the core, decode the ops. */
function myersDiff(
  fn: MyersFn,
  oldTokens: Token[],
  newTokens: Token[],
): DiffOp[] {
  const { oldIds, newIds } = measure(
    () => assignTokenIds(oldTokens, newTokens),
    `assignTokenIds ${oldTokens.length} ${newTokens.length}`,
  );
  const flat = measure(() => fn(oldIds, newIds), "myers-core");
  return measure(() => decodeOps(flat), "decode");
}

export function jsMyers(a: Int32Array, b: Int32Array): Int32Array {
  const ops: number[] = [];
  diffRec(a, b, 0, 0, ops);
  return Int32Array.from(ops);
}

function diffRec(
  a: Int32Array,
  b: Int32Array,
  aOff: number,
  bOff: number,
  ops: number[],
): void {
  const n = a.length;
  const m = b.length;
  if (n === 0) {
    for (let j = 0; j < m; j++) ops.push(INS, -1, bOff + j);
    return;
  }
  if (m === 0) {
    for (let i = 0; i < n; i++) ops.push(DEL, aOff + i, -1);
    return;
  }

  const [x, y, u, v] = findMiddleSnake(a, b);

  // The search only fails to split when the optimal path's middle is a
  // zero-length snake at an endpoint, which happens exactly for a single edit
  // at the very start or end (D <= 1). Recover those directly so the recursion
  // always makes progress; everything else splits cleanly.
  if (x === 0 && y === 0 && u === 0 && v === 0) {
    for (let i = 0; i < n; i++) ops.push(DEL, aOff + i, -1);
    for (let j = 0; j < m; j++) ops.push(INS, -1, bOff + j);
    return;
  }
  // Single edit at the very end: matches are a common prefix, then the trailing
  // edit (one side is empty after the prefix).
  if (x === n && y === m) {
    const p = commonPrefixLen(a, b);
    for (let k = 0; k < p; k++) ops.push(EQ, aOff + k, bOff + k);
    diffRec(a.subarray(p), b.subarray(p), aOff + p, bOff + p, ops);
    return;
  }
  // Single edit at the very start: a leading edit, then a common suffix.
  if (u === 0 && v === 0) {
    const s = commonSuffixLen(a, b);
    diffRec(a.subarray(0, n - s), b.subarray(0, m - s), aOff, bOff, ops);
    for (let k = 0; k < s; k++) {
      ops.push(EQ, aOff + (n - s) + k, bOff + (m - s) + k);
    }
    return;
  }

  // Normal split: left half, the middle snake (matched run), right half.
  diffRec(a.subarray(0, x), b.subarray(0, y), aOff, bOff, ops);
  const snake = u - x; // == v - y
  for (let k = 0; k < snake; k++) ops.push(EQ, aOff + x + k, bOff + y + k);
  diffRec(a.subarray(u), b.subarray(v), aOff + u, bOff + v, ops);
}

/** Find a middle snake: a matched run `(x,y) -> (u,v)` on an optimal edit
 * path, with `a[x..u] == b[y..v]`. Forward search from `(0,0)`, reverse from
 * `(n,m)`, increasing `d` until they overlap. */
function findMiddleSnake(
  a: Int32Array,
  b: Int32Array,
): [number, number, number, number] {
  const n = a.length;
  const m = b.length;
  const delta = n - m;
  const maxD = Math.floor((n + m + 1) / 2);
  // Generous offset/size so every diagonal we touch stays in bounds.
  const off = 2 * (n + m);
  const sz = 4 * (n + m) + 1;
  const vf = new Int32Array(sz);
  const vr = new Int32Array(sz);
  vf[off + 1] = 0;
  vr[off + delta - 1] = n;

  for (let d = 0; d <= maxD; d++) {
    // Forward: extend furthest-reaching x on each diagonal from (0,0).
    for (let k = -d; k <= d; k += 2) {
      const xIn =
        k === -d || (k !== d && vf[off + k + 1] > vf[off + k - 1])
          ? vf[off + k + 1]
          : vf[off + k - 1] + 1;
      let x = xIn;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      vf[off + k] = x;
      // delta odd: forward at distance d meets reverse at distance d-1.
      if (
        delta % 2 !== 0 &&
        d >= 1 &&
        k >= delta - (d - 1) &&
        k <= delta + (d - 1) &&
        x >= vr[off + k]
      ) {
        // Middle snake = the forward snake on diagonal k.
        return [xIn, xIn - k, x, x - k];
      }
    }
    // Reverse: extend furthest-back x on each diagonal from (n,m).
    for (let k = delta + d; k >= delta - d; k -= 2) {
      const xIn =
        k === delta + d ||
        (k !== delta - d && vr[off + k - 1] < vr[off + k + 1])
          ? vr[off + k - 1]
          : vr[off + k + 1] - 1;
      let x = xIn;
      let y = x - k;
      while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
        x--;
        y--;
      }
      vr[off + k] = x;
      // delta even: reverse at distance d meets forward at distance d.
      if (delta % 2 === 0 && k >= -d && k <= d && x <= vf[off + k]) {
        // Middle snake = the reverse snake on diagonal k, oriented forward.
        return [x, x - k, xIn, xIn - k];
      }
    }
  }
  return [0, 0, 0, 0];
}

function commonPrefixLen(a: Int32Array, b: Int32Array): number {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p++;
  return p;
}

function commonSuffixLen(a: Int32Array, b: Int32Array): number {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n, m);
  let s = 0;
  while (s < max && a[n - 1 - s] === b[m - 1 - s]) s++;
  return s;
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
