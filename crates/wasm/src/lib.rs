//! Essayist WASM crate.
//!
//! The JS-facing surface is exposed via `#[wasm_bindgen]`. It carries a
//! trivial smoke export, an Int32Array sort example, and the Myers diff port
//! that step 5 wires into `computeDiff`.

use js_sys::Int32Array;
use wasm_bindgen::prelude::*;

/// Op type codes used by the flat `Int32Array` encoding returned by `myers`.
/// 0 = equal, 1 = insert, 2 = delete (matches the JS `DiffOp.type` ordering).
const EQ: i32 = 0;
const INS: i32 = 1;
const DEL: i32 = 2;

/// Trivial smoke export: add two i32s. Verifies the bindgen glue and the
/// build pipeline before anything algorithmic goes in.
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Sort an Int32Array and return a new, sorted Int32Array.
///
/// This is the boundary shape Myers uses: Int32Array in (token ids),
/// Int32Array out (ops). The input is borrowed read-only, so the caller's
/// array is not mutated and the result is a fresh typed array.
#[wasm_bindgen]
pub fn sort_ints(arr: &[i32]) -> Int32Array {
    let mut v = arr.to_vec();
    v.sort_unstable();
    let out = Int32Array::new_with_length(v.len() as u32);
    out.copy_from(&v);
    out
}

/// Myers' O((N+M)*D) shortest-edit-script on integer token ids.
///
/// `old_token_ids` / `new_token_ids` carry per-token integer ids assigned in JS
/// so identical token strings share an id; Rust then compares ids with `==`,
/// matching the JS `oldTokens[x].text === newTokens[y].text` check. Returns a
/// flat `Int32Array` of `[type, oldIdx, newIdx, ...]` triples where `type` is
/// 0=equal, 1=insert, 2=delete; the unused index is -1 (inserts: oldIdx=-1,
/// deletes: newIdx=-1). The edit script is identical to the JS `myersDiff`
/// output, including the tie-break: the JS forward condition uses strict `>`
/// (`v[k+1] > v[k-1]`), so on a tie the right/delete edge (k-1) is taken. The
/// backtracking step mirrors that exactly.
///
/// This is the full-trace variant (same as the JS implementation): each `d`
/// iteration snapshots the `[-d, d]` slice of `v` for backtracking, which is
/// O(D^2) memory. A linear-space (Hirschberg-style) upgrade that reproduces
/// the exact same edit script is tracked as a follow-up; correctness and
/// matching `diff_test.ts` took priority over the memory win.
#[wasm_bindgen]
pub fn myers(old_token_ids: &[i32], new_token_ids: &[i32]) -> Int32Array {
    let ops = myers_ops(old_token_ids, new_token_ids);
    let out = Int32Array::new_with_length(ops.len() as u32);
    out.copy_from(&ops);
    out
}

/// Pure-Rust Myers core returning the flat op vec. Separated from the
/// `#[wasm_bindgen]` wrapper so it can be unit-tested on the native target
/// without the JS glue.
pub fn myers_ops(old_token_ids: &[i32], new_token_ids: &[i32]) -> Vec<i32> {
    let n = old_token_ids.len() as i32;
    let m = new_token_ids.len() as i32;

    if n == 0 && m == 0 {
        return Vec::new();
    }
    if n == 0 {
        return inserts(m);
    }
    if m == 0 {
        return deletes(n);
    }

    let max = n + m;
    let offset = max;
    let v_len = (2 * max + 1) as usize;
    let mut v = vec![-1i32; v_len];
    v[(offset + 1) as usize] = 0;

    // Per-d snapshots of the [-d, d] slice of v, captured at the start of each
    // iteration (i.e. the state the d-th iteration reads from). Used to
    // backtrack the edit script once (n, m) is reached.
    let mut trace: Vec<Vec<i32>> = Vec::with_capacity((max + 1) as usize);

    let mut final_d: i32 = -1;
    for d in 0..=max {
        let lo = (offset - d) as usize;
        let hi = (offset + d + 1) as usize;
        trace.push(v[lo..hi].to_vec());

        let mut done = false;
        let mut k = -d;
        while k <= d {
            let x_in = pick_x(&v, offset, k, d);
            let mut x = x_in;
            let mut y = x - k;
            while x < n && y < m && old_token_ids[x as usize] == new_token_ids[y as usize] {
                x += 1;
                y += 1;
            }
            v[(offset + k) as usize] = x;
            if x >= n && y >= m {
                final_d = d;
                done = true;
                break;
            }
            k += 2;
        }
        if done {
            break;
        }
    }
    if final_d == -1 {
        final_d = max;
    }

    // Backtrack from (n, m) to (0, 0) using the trace, then reverse.
    let mut ops: Vec<i32> = Vec::new();
    let mut x = n;
    let mut y = m;
    for d in (1..=final_d).rev() {
        let snap = &trace[d as usize];
        let k = x - y;
        let prev_k = pick_prev_k(snap, k, d);
        let prev_x = snap[(prev_k + d) as usize];
        let prev_y = prev_x - prev_k;
        while x > prev_x && y > prev_y {
            ops.extend_from_slice(&[EQ, x - 1, y - 1]);
            x -= 1;
            y -= 1;
        }
        if x == prev_x {
            ops.extend_from_slice(&[INS, -1, y - 1]);
            y -= 1;
        } else {
            ops.extend_from_slice(&[DEL, x - 1, -1]);
            x -= 1;
        }
    }
    // Remaining leading diagonal (D = 0): pure matches from (x, y) to (0, 0).
    while x > 0 && y > 0 {
        ops.extend_from_slice(&[EQ, x - 1, y - 1]);
        x -= 1;
        y -= 1;
    }
    // The backtracking above emitted ops end-to-start. Reverse the order of
    // triples (NOT the flat ints -- the JS `ops.reverse()` operates on an
    // array of op objects; here each op is 3 consecutive ints that must stay
    // intact).
    let mut ordered = Vec::with_capacity(ops.len());
    for chunk in ops.chunks_exact(3).rev() {
        ordered.extend_from_slice(chunk);
    }
    ordered
}

/// Choose the incoming x for diagonal `k` at distance `d`.
///
/// Mirrors the JS forward condition:
/// `if (k === -d || (k !== d && v[k+1] > v[k-1]))` -> down/insert (from k+1);
/// else right/delete (from k-1). The short-circuit edge cases (`k == -d`,
/// `k == d`) are split into separate branches so the out-of-range index is
/// never materialized.
fn pick_x(v: &[i32], offset: i32, k: i32, d: i32) -> i32 {
    // Mirrors the JS short-circuit: `k == -d` forces the insert edge, and the
    // `k != d` guard skips the k-1 read at the top edge. The boolean `||`/`&&`
    // short-circuit, so the out-of-range index (offset + k - 1 at k == -d) is
    // never materialized.
    let from_insert =
        k == -d || (k != d && v[(offset + k + 1) as usize] > v[(offset + k - 1) as usize]);
    if from_insert {
        v[(offset + k + 1) as usize]
    } else {
        v[(offset + k - 1) as usize] + 1
    }
}

/// Backtracking counterpart of `pick_x`: decide which diagonal we came from.
/// `snap` covers `[-d, d]`, so diagonal `k` lives at index `k + d`.
fn pick_prev_k(snap: &[i32], k: i32, d: i32) -> i32 {
    // See `pick_x`: the boolean short-circuits so the k-1 index is only read
    // when k is not an edge diagonal.
    let from_insert =
        k == -d || (k != d && snap[(k + 1 + d) as usize] > snap[(k - 1 + d) as usize]);
    if from_insert { k + 1 } else { k - 1 }
}

/// All-insert edit script (n == 0): one insert op per new token.
fn inserts(m: i32) -> Vec<i32> {
    let mut ops = Vec::with_capacity((m as usize) * 3);
    for j in 0..m {
        ops.extend_from_slice(&[INS, -1, j]);
    }
    ops
}

/// All-delete edit script (m == 0): one delete op per old token.
fn deletes(n: i32) -> Vec<i32> {
    let mut ops = Vec::with_capacity((n as usize) * 3);
    for i in 0..n {
        ops.extend_from_slice(&[DEL, i, -1]);
    }
    ops
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decode the flat op vec into (type, old_idx, new_idx) triples.
    fn decode(ops: &[i32]) -> Vec<(i32, i32, i32)> {
        ops.chunks_exact(3).map(|c| (c[0], c[1], c[2])).collect()
    }

    #[test]
    fn empty_inputs() {
        assert!(myers_ops(&[], &[]).is_empty());
    }

    #[test]
    fn only_inserts() {
        let ops = myers_ops(&[], &[1, 2, 3]);
        assert_eq!(decode(&ops), [(INS, -1, 0), (INS, -1, 1), (INS, -1, 2)]);
    }

    #[test]
    fn only_deletes() {
        let ops = myers_ops(&[1, 2, 3], &[]);
        assert_eq!(decode(&ops), [(DEL, 0, -1), (DEL, 1, -1), (DEL, 2, -1)]);
    }

    #[test]
    fn identical_tokens_are_all_equal() {
        let ops = myers_ops(&[1, 2, 3], &[1, 2, 3]);
        assert_eq!(decode(&ops), [(EQ, 0, 0), (EQ, 1, 1), (EQ, 2, 2)]);
    }

    #[test]
    fn single_token_replace_matches_js_tie_break() {
        // "cat" -> "car": tokens differ in the last token. The JS output for
        // "abc def"->"xyz uvw" is a full replace (no common tokens), so the
        // script is delete-all then insert-all with deletes before inserts.
        let ops = myers_ops(&[1, 2], &[3, 4]);
        assert_eq!(
            decode(&ops),
            [(DEL, 0, -1), (DEL, 1, -1), (INS, -1, 0), (INS, -1, 1)]
        );
    }

    #[test]
    fn insert_in_the_middle() {
        // old: A B C, new: A X B C -> insert X at index 1.
        let ops = myers_ops(&[1, 2, 3], &[1, 4, 2, 3]);
        assert_eq!(
            decode(&ops),
            [(EQ, 0, 0), (INS, -1, 1), (EQ, 1, 2), (EQ, 2, 3)]
        );
    }

    #[test]
    fn delete_in_the_middle() {
        // old: A X B C, new: A B C -> delete X at old index 1.
        let ops = myers_ops(&[1, 4, 2, 3], &[1, 2, 3]);
        assert_eq!(
            decode(&ops),
            [(EQ, 0, 0), (DEL, 1, -1), (EQ, 2, 1), (EQ, 3, 2)]
        );
    }

    #[test]
    fn two_separate_replaces() {
        // old: A B C D, new: A E C F -> replace B->E (idx 1) and D->F (idx 3).
        let ops = myers_ops(&[1, 2, 3, 4], &[1, 5, 3, 6]);
        assert_eq!(
            decode(&ops),
            [
                (EQ, 0, 0),
                (DEL, 1, -1),
                (INS, -1, 1),
                (EQ, 2, 2),
                (DEL, 3, -1),
                (INS, -1, 3),
            ]
        );
    }
}
