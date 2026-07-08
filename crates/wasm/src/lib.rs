//! Essayist WASM crate.
//!
//! The JS-facing surface is exposed via `#[wasm_bindgen]`. For now this carries
//! a trivial smoke export and an Int32Array sort example that proves the
//! boundary shape Myers will later rely on (Int32Array in, Int32Array out).
//! The actual Myers port lands in a later commit.

use js_sys::Int32Array;
use wasm_bindgen::prelude::*;

/// Trivial smoke export: add two i32s. Verifies the bindgen glue and the
/// build pipeline before anything algorithmic goes in.
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Sort an Int32Array and return a new, sorted Int32Array.
///
/// This is the boundary shape Myers will use: Int32Array in (token ids),
/// Int32Array out (ops). The input is borrowed read-only, so the caller's
/// array is not mutated and the result is a fresh typed array of the same
/// length.
#[wasm_bindgen]
pub fn sort_ints(arr: &[i32]) -> Int32Array {
    let mut v = arr.to_vec();
    v.sort_unstable();
    let out = Int32Array::new_with_length(v.len() as u32);
    out.copy_from(&v);
    out
}
