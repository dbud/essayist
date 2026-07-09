/* tslint:disable */
/* eslint-disable */

/**
 * Myers' shortest-edit-script on integer token ids, linear-space variant.
 *
 * `old_token_ids` / `new_token_ids` carry per-token integer ids assigned in JS
 * so identical token strings share an id; Rust compares ids with `==`,
 * matching the JS `oldTokens[x].text === newTokens[y].text` check. Returns a
 * flat `Int32Array` of `[type, oldIdx, newIdx, ...]` triples where `type` is
 * 0=equal, 1=insert, 2=delete; the unused index is -1 (inserts: oldIdx=-1,
 * deletes: newIdx=-1).
 *
 * `O((N+M)D)` time, `O(N+M)` memory via the middle-snake divide-and-conquer: find
 * a matched diagonal run on an optimal path, recurse on the two halves. The
 * edit script is minimal; its tie-break on repeated-token inputs can differ
 * from a forward-only Myers, but the diff is always a valid minimal
 * alignment (see the test suite).
 */
export function myers(old_token_ids: Int32Array, new_token_ids: Int32Array): Int32Array;

/**
 * Sort an Int32Array and return a new, sorted Int32Array. Used by the wasm
 * worker demo; the input is borrowed read-only and the result is a fresh
 * typed array.
 */
export function sort_ints(arr: Int32Array): Int32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
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
