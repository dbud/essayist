import { expect, test } from "vitest";

import { TokenizedText, tokenDiceSimilarity, wordTokens } from "./tokenized.ts";

// Benchmarks the wTexts allocation inside the window pass of TokenizedText.findFuzzyInTokenWindow.
// Run with: vitest bench src/marks/tokenized.bench.ts (ignored by the regular test run).

const WORDS = [
  "the",
  "quick",
  "brown",
  "essay",
  "marks",
  "draft",
  "version",
  "editor",
  "cursor",
  "style",
  "text",
  "read",
  "note",
  "line",
  "page",
  "word",
];

const text = Array.from({ length: 2000 }, (_, i) => WORDS[i % WORDS.length]).join(" ");
const tt = new TokenizedText(text);
const pattern = "quick brown essay marks";
const pTexts = wordTokens(pattern).map((t) => t.text);
const tokens = Array.from({ length: 2000 }, (_, i) => ({ text: WORDS[i % WORDS.length] }));

const windowStart = 0;
const windowEnd = 400;
// Local bindings: imported bindings are module-runner getters.
const dice = tokenDiceSimilarity;

// Both variants mirror the window loop in findFuzzyInTokenWindow exactly: the same inner gather-
// and-compare pass, dice on every non-exact window. sink accumulates and is read after the runs so
// the engines cannot drop the work.
function scorePreallocated(): number {
  let sink = 0;
  for (let i = windowStart; i + 4 <= windowEnd; i++) {
    let isExact = true;
    // oxlint-disable-next-line unicorn/no-new-array -- mirrors the production pattern
    const wTexts = new Array<string>(4);
    for (let k = 0; k < 4; k++) {
      const w = tokens[i + k].text;
      wTexts[k] = w;
      if (w !== pTexts[k]) isExact = false;
    }
    sink += isExact ? 1 : dice(pTexts, wTexts);
  }
  return sink;
}

function scorePush(): number {
  let sink = 0;
  for (let i = windowStart; i + 4 <= windowEnd; i++) {
    let isExact = true;
    const wTexts: string[] = [];
    for (let k = 0; k < 4; k++) {
      const w = tokens[i + k].text;
      wTexts.push(w);
      if (w !== pTexts[k]) isExact = false;
    }
    sink += isExact ? 1 : dice(pTexts, wTexts);
  }
  return sink;
}

let sink = 0;

test("wTexts allocation, preallocated vs push", async ({ bench }) => {
  expect(scorePreallocated()).toBe(scorePush());
  const addSink = (score: () => number): void => {
    sink += score();
  };
  await bench.compare(
    bench("preallocated wTexts", () => {
      addSink(scorePreallocated);
    }),
    bench("push wTexts", () => {
      addSink(scorePush);
    }),
  );
  expect(sink).toBeGreaterThan(0);
});

test("findFuzzyInTokenWindow end to end", async ({ bench }) => {
  await bench("fuzzy window resolve", () => {
    tt.findFuzzyInTokenWindow(pattern, {
      near: 2000,
      withinTokens: 400,
      threshold: 0.3,
      side: "before",
    });
  }).run();
});
