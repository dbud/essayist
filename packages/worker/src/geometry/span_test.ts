import { assertEquals } from "@std/assert";
import { test } from "vitest";

import {
  coveredFraction,
  firstAfterEdge,
  hull,
  lastBeforeEdge,
  outsideOf,
  type Span,
  spanOf,
} from "./span.ts";

const span = (top: number, bottom: number): Span => ({ top, bottom });

test("spanOf -- top plus height", () => {
  assertEquals(spanOf({ top: 12, height: 30 }), { top: 12, bottom: 42 });
});

test("hull -- empty list is undefined", () => {
  assertEquals(hull([]), undefined);
});

test("hull -- covers all spans regardless of order", () => {
  assertEquals(hull([span(50, 80), span(10, 40), span(30, 90)]), span(10, 90));
});

test("hull -- a single zero-length span is kept", () => {
  assertEquals(hull([span(20, 20)]), span(20, 20));
});

test("firstAfterEdge -- strictly past the edge", () => {
  const spans = [span(0, 40), span(50, 120)];
  assertEquals(
    firstAfterEdge(spans, (s) => s, 40),
    span(50, 120),
  );
  assertEquals(
    firstAfterEdge(spans, (s) => s, 39),
    span(0, 40),
  );
  assertEquals(
    firstAfterEdge(spans, (s) => s, 120),
    undefined,
  );
});

test("lastBeforeEdge -- strictly before the edge", () => {
  const spans = [span(0, 40), span(50, 120)];
  assertEquals(
    lastBeforeEdge(spans, (s) => s, 50),
    span(0, 40),
  );
  assertEquals(
    lastBeforeEdge(spans, (s) => s, 51),
    span(50, 120),
  );
  assertEquals(
    lastBeforeEdge(spans, (s) => s, 0),
    undefined,
  );
});

test("outsideOf -- boundary alignment counts as inside", () => {
  const window = span(100, 400);
  assertEquals(outsideOf(span(100, 400), window), false);
  assertEquals(outsideOf(span(99, 400), window), true);
  assertEquals(outsideOf(span(100, 401), window), true);
});

test("coveredFraction -- none, partial, full, degenerate", () => {
  assertEquals(coveredFraction(span(0, 100), span(200, 300)), 0);
  assertEquals(coveredFraction(span(0, 100), span(50, 200)), 0.5);
  assertEquals(coveredFraction(span(0, 100), span(-10, 200)), 1);
  assertEquals(coveredFraction(span(20, 20), span(0, 100)), 0);
});
