//! Essayist WASM crate.
//!
//! Currently a placeholder; the wasm-bindgen boundary and exported functions
//! arrive in later commits (build wiring, then a sort example, then Myers).

/// Toolchain smoke check callable from JS once the bindgen glue is wired up.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
