import { assertEquals } from "@std/assert";
import { assertObjectMatch } from "@std/assert/object-match";
import { computeDiff } from "./diff.ts";

Deno.test("computeDiff -- identical content produces no hunks", () => {
  const result = computeDiff("hello world", "hello world");
  assertEquals(result, []);
});

Deno.test("computeDiff -- empty old content produces single insert hunk", () => {
  const result = computeDiff("", "hello world");
  assertEquals(result, [{
    type: "insert",
    oldStart: 0,
    oldEnd: 0,
    newStart: 0,
    newEnd: 11,
    oldText: "",
    newText: "hello world",
  }]);
});

Deno.test("computeDiff -- empty new content produces single delete hunk", () => {
  const result = computeDiff("hello world", "");
  assertEquals(result, [{
    type: "delete",
    oldStart: 0,
    oldEnd: 11,
    newStart: 0,
    newEnd: 0,
    oldText: "hello world",
    newText: "",
  }]);
});

Deno.test("computeDiff -- both empty produces no hunks", () => {
  const result = computeDiff("", "");
  assertEquals(result, []);
});

// tokens include trailing whitespace. "quick " is one token

Deno.test("computeDiff -- single word replaced", () => {
  const result = computeDiff("The quick brown fox", "The slow brown fox");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "quick ",
    newText: "slow ",
  });
});

Deno.test("computeDiff -- single word inserted", () => {
  const result = computeDiff("The brown fox", "The quick brown fox");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "insert",
    oldText: "",
    newText: "quick ",
  });
});

Deno.test("computeDiff -- single word deleted", () => {
  const result = computeDiff("The quick brown fox", "The brown fox");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "delete",
    oldText: "quick ",
    newText: "",
  });
});

Deno.test("computeDiff -- two separate changes", () => {
  const result = computeDiff(
    "Alpha Beta Gamma Delta",
    "Alpha Modified Gamma Altered",
  );
  assertEquals(result.length, 2);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "Beta ",
    newText: "Modified ",
  });
  assertObjectMatch(result[1], {
    type: "replace",
    oldText: "Delta",
    newText: "Altered",
  });
});

Deno.test("computeDiff -- change at beginning", () => {
  const result = computeDiff("Hello world", "Goodbye world");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "Hello ",
    newText: "Goodbye ",
  });
});

Deno.test("computeDiff -- prose: one word changed in paragraph", () => {
  const oldContent = "The art of writing requires patience and dedication.";
  const newContent = "The art of writing requires patience and commitment.";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "dedication.",
    newText: "commitment.",
  });
});

Deno.test("computeDiff -- prose: word inserted in paragraph", () => {
  const oldContent = "Writing requires dedication.";
  const newContent = "Writing truly requires dedication.";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "insert",
    newText: "truly ",
  });
});

Deno.test("computeDiff -- prose: sentence deleted", () => {
  const oldContent = "First sentence. Second sentence. Third sentence.";
  const newContent = "First sentence. Third sentence.";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "delete",
    oldText: "sentence. Second ",
  });
  // LCS matches the second "sentence. " in old with the first in new
  // so the first "sentence. " and "Second " are deleted
});

Deno.test("computeDiff -- prose: sentence inserted", () => {
  const oldContent = "First sentence. Third sentence.";
  const newContent = "First sentence. Second sentence. Third sentence.";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "insert",
    newText: "sentence. Second ",
  });
  // LCS matches the first "sentence. " in new with old
});

Deno.test("computeDiff -- prose: multiple paragraph changes", () => {
  const result = computeDiff(
    `The first paragraph is about writing.
The second paragraph is about editing.
The third paragraph is about publishing.`,
    `The first paragraph is about writing.
The second paragraph is about revising.
The third paragraph is about publishing.`,
  );
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "editing.\n",
    newText: "revising.\n",
  });
});

Deno.test("computeDiff -- punctuation attached to words", () => {
  const result = computeDiff("Hello, world!", "Hello, universe!");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    oldText: "world!",
    newText: "universe!",
  });
});

Deno.test("computeDiff -- multiple spaces between words", () => {
  const result = computeDiff("Hello  world", "Hello  universe");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    oldText: "world",
    newText: "universe",
  });
});

Deno.test("computeDiff -- newlines are preserved in tokens", () => {
  const oldContent = "Line one.\nLine two.";
  const newContent = "Line one.\nLine three.";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    oldText: "two.",
    newText: "three.",
  });
});

Deno.test("computeDiff -- completely different content", () => {
  const result = computeDiff("abc def", "xyz uvw");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "abc def",
    newText: "xyz uvw",
  });
});

Deno.test("computeDiff -- single character difference", () => {
  const result = computeDiff("cat", "car");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "cat",
    newText: "car",
  });
});

Deno.test("computeDiff -- long prose with single word change", () => {
  const result = computeDiff(
    "The art of writing is a craft that has been practiced for thousands of years evolving from ancient cave paintings to digital documents we create today At its core writing is about communication the transfer of ideas emotions and knowledge from one mind to another across time and space",
    "The art of writing is a craft that has been practiced for thousands of years evolving from ancient cave paintings to digital documents we create today At its core writing is about communication the transfer of ideas feelings and knowledge from one mind to another across time and space",
  );
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "replace",
    oldText: "emotions ",
    newText: "feelings ",
  });
});

Deno.test("computeDiff -- change hunk has correct offsets", () => {
  const result = computeDiff("The quick brown fox", "The slow brown fox");
  assertEquals(result, [{
    type: "replace",
    oldStart: 4,
    oldEnd: 10,
    newStart: 4,
    newEnd: 9,
    oldText: "quick ",
    newText: "slow ",
  }]);
});

Deno.test("computeDiff -- delete hunk has correct offsets", () => {
  const result = computeDiff("The quick brown fox", "The brown fox");
  assertEquals(result, [{
    type: "delete",
    oldStart: 4,
    oldEnd: 10,
    newStart: 4,
    newEnd: 4,
    oldText: "quick ",
    newText: "",
  }]);
});

Deno.test("computeDiff -- insert hunk has correct offsets", () => {
  const result = computeDiff("The brown fox", "The quick brown fox");
  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    type: "insert",
    oldStart: 4,
    oldEnd: 4,
    newStart: 4,
    newEnd: 10,
    oldText: "",
    newText: "quick ",
  });
});

Deno.test("computeDiff -- two changes have correct offsets", () => {
  const oldContent = "Alpha Beta Gamma Delta";
  const newContent = "Alpha Modified Gamma Altered";
  const result = computeDiff(oldContent, newContent);
  assertEquals(result, [{
    type: "replace",
    oldStart: 6,
    oldEnd: 11,
    newStart: 6,
    newEnd: 15,
    oldText: "Beta ",
    newText: "Modified ",
  }, {
    type: "replace",
    oldStart: 17,
    oldEnd: 22,
    newStart: 21,
    newEnd: 28,
    oldText: "Delta",
    newText: "Altered",
  }]);
});
