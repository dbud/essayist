//! Essayist WASM crate.
//!
//! The JS-facing surface is exposed via `#[wasm_bindgen]`. For now this only
//! carries a trivial smoke export to prove the boundary end-to-end; the array
//! sort example (step 3) and Myers (step 5) land in later commits.

use wasm_bindgen::prelude::*;

/// Trivial smoke export: add two i32s. Verifies the bindgen glue and the
/// build pipeline before anything algorithmic goes in.
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
