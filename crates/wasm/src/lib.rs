//! Essayist WASM crate.
//!
//! Exposes a linear-space Myers diff via the `myers` `#[wasm_bindgen]`
//! export, backed by the pure-Rust `myers_ops` core. The diff runs in
//! `O((N+M)D)` time and `O(N+M)` memory via a Hirschberg-style
//! middle-snake divide-and-conquer.

use js_sys::Int32Array;
use wasm_bindgen::prelude::*;

/// Op type codes for the flat `Int32Array` encoding returned by `myers`.
/// 0 = equal, 1 = insert, 2 = delete (matches the JS `DiffOp.type` ordering).
const EQ: i32 = 0;
const INS: i32 = 1;
const DEL: i32 = 2;

/// Myers' shortest-edit-script on integer token ids, linear-space variant.
///
/// `old_token_ids` / `new_token_ids` carry per-token integer ids assigned in JS
/// so identical token strings share an id; Rust compares ids with `==`,
/// matching the JS `oldTokens[x].text === newTokens[y].text` check. Returns a
/// flat `Int32Array` of `[type, oldIdx, newIdx, ...]` triples where `type` is
/// 0=equal, 1=insert, 2=delete; the unused index is -1 (inserts: oldIdx=-1,
/// deletes: newIdx=-1).
///
/// `O((N+M)D)` time, `O(N+M)` memory via the middle-snake divide-and-conquer: find
/// a matched diagonal run on an optimal path, recurse on the two halves. The
/// edit script is minimal; its tie-break on repeated-token inputs can differ
/// from a forward-only Myers, but the diff is always a valid minimal
/// alignment (see the test suite).
#[wasm_bindgen]
pub fn myers(old_token_ids: &[i32], new_token_ids: &[i32]) -> Int32Array {
    let ops = myers_ops(old_token_ids, new_token_ids);
    let out = Int32Array::new_with_length(ops.len() as u32);
    out.copy_from(&ops);
    out
}

/// Pure-Rust Myers core returning the flat op vec. Separated from the
/// `#[wasm_bindgen]` wrapper so it can be unit-tested on the native target
/// without the JS glue, and used by the bench/example.
pub fn myers_ops(a: &[i32], b: &[i32]) -> Vec<i32> {
    let mut ops = Vec::new();
    diff_rec(a, b, 0, 0, &mut ops);
    ops
}

/// Recursive divide-and-conquer. `a_off` / `b_off` are the absolute offsets of
/// `a` / `b` within the original inputs, used to emit absolute op indices.
fn diff_rec(a: &[i32], b: &[i32], a_off: i32, b_off: i32, ops: &mut Vec<i32>) {
    let n = a.len() as i32;
    let m = b.len() as i32;
    if n == 0 {
        for j in 0..m {
            ops.extend_from_slice(&[INS, -1, b_off + j]);
        }
        return;
    }
    if m == 0 {
        for i in 0..n {
            ops.extend_from_slice(&[DEL, a_off + i, -1]);
        }
        return;
    }

    let (x, y, u, v) = find_middle_snake(a, b);

    // `find_middle_snake` only fails to split when the optimal path's middle
    // is a zero-length snake at an endpoint, which happens exactly for a
    // single edit at the very start or end (D <= 1). Recover those directly
    // so the recursion always makes progress; everything else splits cleanly.
    if x == 0 && y == 0 && u == 0 && v == 0 {
        // Defensive: the search found no overlap (should not happen for valid
        // inputs). Emit a valid, possibly non-minimal, script.
        for i in 0..n {
            ops.extend_from_slice(&[DEL, a_off + i, -1]);
        }
        for j in 0..m {
            ops.extend_from_slice(&[INS, -1, b_off + j]);
        }
        return;
    }
    // Single edit at the very end: matches are a common prefix, then the
    // trailing edit (one side is empty after the prefix).
    if x == n && y == m {
        let p = common_prefix_len(a, b);
        for k in 0..p {
            ops.extend_from_slice(&[EQ, a_off + k, b_off + k]);
        }
        diff_rec(
            &a[p as usize..],
            &b[p as usize..],
            a_off + p,
            b_off + p,
            ops,
        );
        return;
    }
    // Single edit at the very start: a leading edit, then a common suffix.
    if u == 0 && v == 0 {
        let s = common_suffix_len(a, b);
        diff_rec(
            &a[..(n - s) as usize],
            &b[..(m - s) as usize],
            a_off,
            b_off,
            ops,
        );
        for k in 0..s {
            ops.extend_from_slice(&[EQ, a_off + (n - s) + k, b_off + (m - s) + k]);
        }
        return;
    }

    // Normal split: left half, the middle snake (matched run), right half.
    diff_rec(&a[..x as usize], &b[..y as usize], a_off, b_off, ops);
    let snake = u - x; // == v - y
    for k in 0..snake {
        ops.extend_from_slice(&[EQ, a_off + x + k, b_off + y + k]);
    }
    diff_rec(
        &a[u as usize..],
        &b[v as usize..],
        a_off + u,
        b_off + v,
        ops,
    );
}

/// Find a middle snake: a matched run `(x,y) -> (u,v)` on an optimal edit
/// path, with `a[x..u] == b[y..v]`. Runs a forward search from `(0,0)` and a
/// reverse search from `(n,m)` for increasing `d` until they overlap.
#[allow(clippy::too_many_lines)]
fn find_middle_snake(a: &[i32], b: &[i32]) -> (i32, i32, i32, i32) {
    let n = a.len() as i32;
    let m = b.len() as i32;
    let delta = n - m;
    let max_d = (n + m + 1) / 2;
    // Generous offset/size so every diagonal we touch (forward k in [-d,d],
    // reverse k in [delta-d, delta+d]) stays in bounds.
    let off = 2 * (n + m);
    let sz = (4 * (n + m) + 1) as usize;
    let mut vf = vec![0i32; sz];
    let mut vr = vec![0i32; sz];
    vf[(off + 1) as usize] = 0;
    vr[(off + delta - 1) as usize] = n;

    for d in 0..=max_d {
        // Forward: extend furthest-reaching x on each diagonal from (0,0).
        let mut k = -d;
        while k <= d {
            let x_in =
                if k == -d || (k != d && vf[(off + k + 1) as usize] > vf[(off + k - 1) as usize]) {
                    vf[(off + k + 1) as usize]
                } else {
                    vf[(off + k - 1) as usize] + 1
                };
            let mut x = x_in;
            let mut y = x - k;
            while x < n && y < m && a[x as usize] == b[y as usize] {
                x += 1;
                y += 1;
            }
            vf[(off + k) as usize] = x;
            // delta odd: forward at distance d meets reverse at distance d-1.
            if delta % 2 != 0
                && d >= 1
                && k >= delta - (d - 1)
                && k <= delta + (d - 1)
                && x >= vr[(off + k) as usize]
            {
                // Middle snake = the forward snake on diagonal k.
                return (x_in, x_in - k, x, x - k);
            }
            k += 2;
        }
        // Reverse: extend furthest-back x on each diagonal from (n,m).
        let mut k = delta + d;
        while k >= delta - d {
            let x_in = if k == delta + d
                || (k != delta - d && vr[(off + k - 1) as usize] < vr[(off + k + 1) as usize])
            {
                vr[(off + k - 1) as usize]
            } else {
                vr[(off + k + 1) as usize] - 1
            };
            let mut x = x_in;
            let mut y = x - k;
            while x > 0 && y > 0 && a[x as usize - 1] == b[y as usize - 1] {
                x -= 1;
                y -= 1;
            }
            vr[(off + k) as usize] = x;
            // delta even: reverse at distance d meets forward at distance d.
            if delta % 2 == 0 && k >= -d && k <= d && x <= vf[(off + k) as usize] {
                // Middle snake = the reverse snake on diagonal k, oriented
                // forward: (post-slide) -> (pre-slide).
                return (x, x - k, x_in, x_in - k);
            }
            k -= 2;
        }
    }
    (0, 0, 0, 0)
}

/// Length of the common prefix of `a` and `b`.
fn common_prefix_len(a: &[i32], b: &[i32]) -> i32 {
    let max = a.len().min(b.len());
    let mut p = 0;
    while p < max && a[p] == b[p] {
        p += 1;
    }
    p as i32
}

/// Length of the common suffix of `a` and `b`.
fn common_suffix_len(a: &[i32], b: &[i32]) -> i32 {
    let n = a.len();
    let m = b.len();
    let max = n.min(m);
    let mut s = 0;
    while s < max && a[n - 1 - s] == b[m - 1 - s] {
        s += 1;
    }
    s as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decode the flat op vec into (type, old_idx, new_idx) triples.
    fn decode(ops: &[i32]) -> Vec<(i32, i32, i32)> {
        ops.chunks_exact(3).map(|c| (c[0], c[1], c[2])).collect()
    }

    // -- exact-output cases (deterministic, unambiguous inputs) --

    #[test]
    fn empty_inputs() {
        assert!(myers_ops(&[], &[]).is_empty());
    }

    #[test]
    fn only_inserts() {
        assert_eq!(
            decode(&myers_ops(&[], &[1, 2, 3])),
            [(INS, -1, 0), (INS, -1, 1), (INS, -1, 2)]
        );
    }

    #[test]
    fn only_deletes() {
        assert_eq!(
            decode(&myers_ops(&[1, 2, 3], &[])),
            [(DEL, 0, -1), (DEL, 1, -1), (DEL, 2, -1)]
        );
    }

    #[test]
    fn identical_tokens_are_all_equal() {
        assert_eq!(
            decode(&myers_ops(&[1, 2, 3], &[1, 2, 3])),
            [(EQ, 0, 0), (EQ, 1, 1), (EQ, 2, 2)]
        );
    }

    #[test]
    fn insert_in_the_middle() {
        // old: A B C, new: A X B C -> insert X at index 1.
        assert_eq!(
            decode(&myers_ops(&[1, 2, 3], &[1, 4, 2, 3])),
            [(EQ, 0, 0), (INS, -1, 1), (EQ, 1, 2), (EQ, 2, 3)]
        );
    }

    #[test]
    fn delete_in_the_middle() {
        // old: A X B C, new: A B C -> delete X at old index 1.
        assert_eq!(
            decode(&myers_ops(&[1, 4, 2, 3], &[1, 2, 3])),
            [(EQ, 0, 0), (DEL, 1, -1), (EQ, 2, 1), (EQ, 3, 2)]
        );
    }

    #[test]
    fn insert_at_the_end() {
        // Degenerate (D=1, edit at end): recovered via the common prefix.
        assert_eq!(
            decode(&myers_ops(&[1, 2], &[1, 2, 3])),
            [(EQ, 0, 0), (EQ, 1, 1), (INS, -1, 2)]
        );
    }

    #[test]
    fn delete_at_the_end() {
        assert_eq!(
            decode(&myers_ops(&[1, 2, 3], &[1, 2])),
            [(EQ, 0, 0), (EQ, 1, 1), (DEL, 2, -1)]
        );
    }

    #[test]
    fn insert_at_the_start() {
        assert_eq!(
            decode(&myers_ops(&[1, 2], &[3, 1, 2])),
            [(INS, -1, 0), (EQ, 0, 1), (EQ, 1, 2)]
        );
    }

    #[test]
    fn delete_at_the_start() {
        assert_eq!(
            decode(&myers_ops(&[3, 1, 2], &[1, 2])),
            [(DEL, 0, -1), (EQ, 1, 0), (EQ, 2, 1)]
        );
    }

    #[test]
    fn fully_disjoint_deletes_before_inserts() {
        // No common tokens -> D = n + m; deletes before inserts.
        assert_eq!(
            decode(&myers_ops(&[1, 2], &[3, 4])),
            [(DEL, 0, -1), (DEL, 1, -1), (INS, -1, 0), (INS, -1, 1)]
        );
    }

    // -- property test: validity + minimality on random inputs --

    /// Deterministic LCG so the property test is reproducible.
    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            self.0 >> 33
        }
    }

    /// Reconstruct validity + index consistency: walking the ops must consume
    /// exactly `a` and `b`, with EQ ops pairing equal tokens.
    fn validate(ops: &[i32], a: &[i32], b: &[i32]) -> bool {
        let mut i = 0usize;
        let mut j = 0usize;
        for chunk in ops.chunks_exact(3) {
            match chunk[0] {
                EQ => {
                    if chunk[1] != i as i32 || chunk[2] != j as i32 {
                        return false;
                    }
                    if i >= a.len() || j >= b.len() || a[i] != b[j] {
                        return false;
                    }
                    i += 1;
                    j += 1;
                }
                INS => {
                    if chunk[2] != j as i32 || j >= b.len() {
                        return false;
                    }
                    j += 1;
                }
                DEL => {
                    if chunk[1] != i as i32 || i >= a.len() {
                        return false;
                    }
                    i += 1;
                }
                _ => return false,
            }
        }
        i == a.len() && j == b.len()
    }

    fn edit_distance(ops: &[i32]) -> usize {
        ops.chunks_exact(3).filter(|c| c[0] != EQ).count()
    }

    fn lcs_len(a: &[i32], b: &[i32]) -> usize {
        let mut dp = vec![0usize; b.len() + 1];
        for i in 1..=a.len() {
            let mut prev = 0;
            for j in 1..=b.len() {
                let cur = dp[j];
                dp[j] = if a[i - 1] == b[j - 1] {
                    prev + 1
                } else {
                    dp[j].max(dp[j - 1])
                };
                prev = cur;
            }
        }
        dp[b.len()]
    }

    /// Minimal edit distance = n + m - 2*LCS.
    fn brute_distance(a: &[i32], b: &[i32]) -> usize {
        a.len() + b.len() - 2 * lcs_len(a, b)
    }

    fn rand_seq(rng: &mut Lcg, max_len: u64, alphabet: u64) -> Vec<i32> {
        let len = (rng.next() % (max_len + 1)) as usize;
        (0..len).map(|_| (rng.next() % alphabet) as i32).collect()
    }

    #[test]
    fn is_valid_and_minimal_on_random() {
        let mut rng = Lcg(0x9e3779b97f4a7c15);
        for _ in 0..4000 {
            // Small alphabet forces repeated tokens -> exercises LCS
            // ambiguity, where tie-breaks (and bugs) surface.
            let a = rand_seq(&mut rng, 24, 5);
            let b = rand_seq(&mut rng, 24, 5);
            let ops = myers_ops(&a, &b);

            assert!(
                validate(&ops, &a, &b),
                "script is not a valid alignment\n a = {a:?}\n b = {b:?}\n ops = {ops:?}"
            );
            assert_eq!(
                edit_distance(&ops),
                brute_distance(&a, &b),
                "script is not minimal\n a = {a:?}\n b = {b:?}\n ops = {ops:?}"
            );
        }
    }

    #[test]
    fn large_disjoint_is_valid_and_minimal() {
        // Worst-case large-D: n = 1000 disjoint tokens, D = 2000.
        let n = 1000;
        let a: Vec<i32> = (0..n).collect();
        let b: Vec<i32> = (1_000_000..1_000_000 + n).collect();
        let ops = myers_ops(&a, &b);
        assert!(validate(&ops, &a, &b));
        assert_eq!(edit_distance(&ops), 2 * n as usize);
    }
}
