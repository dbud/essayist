// A/B benchmark: Myers (diff.ts) vs LCS-DP (diff_legacy.ts).
//
// Run with: deno bench packages/core/src/vfs/diff_bench.ts
//
// Generates a long prose document and applies a small number of scattered,
// realistic edits (a few word substitutions + one insertion). This is the
// regime the commit targets: small edit distance D in a large document, where
// Myers' O((N+M)*D) should beat the O(N*M) LCS DP table.

import { computeDiff } from "./diff.ts";
import { computeDiffLegacy } from "./diff_legacy.ts";

// Word pool with realistic English frequency mix.
const WORDS = (
  "the of and to a in is it you that he was for on are with as his they at " +
  "be this have from or one had by word but not what all were we when your can " +
  "said there use an each which she do how their if will up other about out many " +
  "then them these so some her would make like him into time has look two more " +
  "write go see number no way could people my than first water been call who oil " +
  "its now find long down day did get come made may part"
).split(" ");

/** Deterministic PRNG so runs are comparable (no noise from random inputs). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sample {
  name: string;
  oldText: string;
  newText: string;
}

/** Build a prose document of roughly `paragraphs` paragraphs. */
function generateDoc(paragraphs: number, rng: () => number): string {
  const parts: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const sentences = 4 + Math.floor(rng() * 4);
    const words: string[] = [];
    for (let s = 0; s < sentences; s++) {
      const len = 8 + Math.floor(rng() * 12);
      for (let w = 0; w < len; w++) {
        words.push(WORDS[Math.floor(rng() * WORDS.length)]);
      }
      words[words.length - 1] = `${words[words.length - 1]}.`;
    }
    parts.push(words.join(" "));
  }
  return parts.join("\n\n");
}

/**
 * Apply a handful of meaningful edits at well-separated positions:
 * a few word substitutions and one insertion. Returns the edited text.
 * Edits are placed at relative positions so they stay separated regardless
 * of document size.
 */
function applyScatteredEdits(text: string): string {
  const tokens = text.split(/(\s+)/); // keep separators
  const wordIdxs: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/\S/.test(tokens[i]) && !tokens[i].endsWith(".")) wordIdxs.push(i);
  }
  const n = wordIdxs.length;
  // Pick 5 substitutions at ~10%, 30%, 50%, 70%, 90% of the document,
  // plus one insertion near 25%.
  const positions = [0.1, 0.3, 0.5, 0.7, 0.9].map(
    (f) => wordIdxs[Math.floor(f * n)],
  );
  const replacements = ["quickly", "silent", "golden", "ancient", "distant"];
  for (let k = 0; k < positions.length; k++) {
    tokens[positions[k]] = replacements[k];
  }
  // Insertion at ~25%: splice a new word + space before the chosen word.
  const insIdx = wordIdxs[Math.floor(0.25 * n)];
  tokens.splice(insIdx, 0, "suddenly", " ");
  return tokens.join("");
}

function buildSamples(): Sample[] {
  const rng = mulberry32(0xc0ffee);
  const sizes: Array<{ name: string; paragraphs: number }> = [
    { name: "small (~200 words)", paragraphs: 3 },
    { name: "medium (~1.9k words)", paragraphs: 25 },
    { name: "large (~18.5k words)", paragraphs: 250 },
  ];
  return sizes.map(({ name, paragraphs }) => {
    const oldText = generateDoc(paragraphs, rng);
    const newText = applyScatteredEdits(oldText);
    return { name, oldText, newText };
  });
}

const samples = buildSamples();

for (const s of samples) {
  const words = s.oldText.split(/\s+/).filter(Boolean).length;
  console.log(`${s.name}: ${words} words, ${s.oldText.length} chars`);
}

// Sanity: both implementations must agree on the number of hunks. If they
// diverge, the benchmark is comparing non-equivalent results and the numbers
// are meaningless.
for (const s of samples) {
  const a = computeDiff(s.oldText, s.newText);
  const b = computeDiffLegacy(s.oldText, s.newText);
  if (a.length !== b.length) {
    throw new Error(
      `Hunk count mismatch for ${s.name}: myers=${a.length} lcs=${b.length}`,
    );
  }
}

for (const sample of samples) {
  const group = sample.name;
  Deno.bench({
    name: `${group} -- Myers (new)`,
    group,
    baseline: false,
    fn: () => {
      computeDiff(sample.oldText, sample.newText);
    },
  });
  Deno.bench({
    name: `${group} -- LCS DP (legacy)`,
    group,
    baseline: true,
    fn: () => {
      computeDiffLegacy(sample.oldText, sample.newText);
    },
  });
}
