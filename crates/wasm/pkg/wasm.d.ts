/* tslint:disable */
/* eslint-disable */

/**
 * Trivial smoke export: add two i32s. Verifies the bindgen glue and the
 * build pipeline before anything algorithmic goes in.
 */
export function add(a: number, b: number): number;

/**
 * Myers' O((N+M)*D) shortest-edit-script on integer token ids.
 *
 * `old_token_ids` / `new_token_ids` carry per-token integer ids assigned in JS
 * so identical token strings share an id; Rust then compares ids with `==`,
 * matching the JS `oldTokens[x].text === newTokens[y].text` check. Returns a
 * flat `Int32Array` of `[type, oldIdx, newIdx, ...]` triples where `type` is
 * 0=equal, 1=insert, 2=delete; the unused index is -1 (inserts: oldIdx=-1,
 * deletes: newIdx=-1). The edit script is identical to the JS `myersDiff`
 * output, including the tie-break: the JS forward condition uses strict `>`
 * (`v[k+1] > v[k-1]`), so on a tie the right/delete edge (k-1) is taken. The
 * backtracking step mirrors that exactly.
 *
 * This is the full-trace variant (same as the JS implementation): each `d`
 * iteration snapshots the `[-d, d]` slice of `v` for backtracking, which is
 * O(D^2) memory. A linear-space (Hirschberg-style) upgrade that reproduces
 * the exact same edit script is tracked as a follow-up; correctness and
 * matching `diff_test.ts` took priority over the memory win.
 */
export function myers(old_token_ids: Int32Array, new_token_ids: Int32Array): Int32Array;

/**
 * Sort an Int32Array and return a new, sorted Int32Array.
 *
 * This is the boundary shape Myers uses: Int32Array in (token ids),
 * Int32Array out (ops). The input is borrowed read-only, so the caller's
 * array is not mutated and the result is a fresh typed array.
 */
export function sort_ints(arr: Int32Array): Int32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly add: (a: number, b: number) => number;
    readonly myers: (a: number, b: number, c: number, d: number) => any;
    readonly sort_ints: (a: number, b: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
