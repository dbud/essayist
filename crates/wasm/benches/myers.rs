//! Criterion benches for the pure-Rust Myers core (`myers_ops`).
//!
//! Run: `cargo bench` (or `cargo bench --bench myers`).
//!
//! Workloads span the regime we care about: large-D disjoint (the worst case
//! for time), a medium scattered-D case, and the realistic small-D case for
//! contrast. `myers_ops` is the linear-space (O((N+M)D) time, O(N+M) memory)
//! implementation.

use criterion::{BenchmarkId, Criterion, black_box, criterion_group, criterion_main};

use essayist_wasm::myers_ops;

/// Disjoint old/new token ids: no matches, so D = 2n (the large-D worst case).
fn worst_case_disjoint(n: i32) -> (Vec<i32>, Vec<i32>) {
    let old: Vec<i32> = (0..n).collect();
    let new: Vec<i32> = (1_000_000..1_000_000 + n).collect();
    (old, new)
}

/// Long shared run with one swapped token near the middle: D = 2.
fn realistic_small_change(n: i32) -> (Vec<i32>, Vec<i32>) {
    let old: Vec<i32> = (0..n).collect();
    let mut new = old.clone();
    new[(n / 2) as usize] = 9_999_999;
    (old, new)
}

/// Evenly spaced single-token swaps: `changes` edits -> D = 2 * changes.
fn scattered_changes(n: i32, changes: i32) -> (Vec<i32>, Vec<i32>) {
    let old: Vec<i32> = (0..n).collect();
    let mut new = old.clone();
    let step = (n / changes).max(1);
    let mut k = 0i32;
    while k < n {
        new[k as usize] = 9_000_000 + k;
        k += step;
    }
    (old, new)
}

fn bench_myers(c: &mut Criterion) {
    let mut group = c.benchmark_group("myers");

    // Large-D: scale n to see the O((N+M)D) time / O(N+M) memory behaviour.
    for n in [500, 1000, 2000] {
        let (old, new) = worst_case_disjoint(n);
        group.bench_with_input(BenchmarkId::new("worst_disjoint", n), &n, |b, _| {
            b.iter(|| myers_ops(black_box(&old), black_box(&new)))
        });
    }

    // Medium scattered-D.
    {
        let (old, new) = scattered_changes(5000, 100);
        group.bench_function("scattered D=200 (n=5000)", |b| {
            b.iter(|| myers_ops(black_box(&old), black_box(&new)))
        });
    }

    // Realistic small-D.
    {
        let (old, new) = realistic_small_change(5000);
        group.bench_function("realistic D=2 (n=5000)", |b| {
            b.iter(|| myers_ops(black_box(&old), black_box(&new)))
        });
    }

    group.finish();
}

criterion_group!(benches, bench_myers);
criterion_main!(benches);
