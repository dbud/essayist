// Shared diff test cases, parameterized over the `compute` function so the JS
// core path (`diff_test.ts`) and the WASM core path (`diff_wasm_test.ts`) run
// the same assertions. `label` prefixes the test names so the two suites are
// distinguishable in output. Both cores are byte-identical (linear-space
// Myers), so there is a single set of expectations.

import { assertEquals, assertObjectMatch } from "@std/assert";

import type { DiffHunk } from "./diff.ts";

type Compute = (oldText: string, newText: string) => DiffHunk[];

export function runDiffCases(label: string, compute: Compute): void {
  const name = (s: string) => `${label} -- ${s}`;

  Deno.test(name("identical content produces no hunks"), () => {
    assertEquals(compute("hello world", "hello world"), []);
  });

  Deno.test(name("empty old content produces single insert hunk"), () => {
    assertEquals(compute("", "hello world"), [
      {
        type: "insert",
        oldStart: 0,
        oldEnd: 0,
        newStart: 0,
        newEnd: 11,
        oldText: "",
        newText: "hello world",
      },
    ]);
  });

  Deno.test(name("empty new content produces single delete hunk"), () => {
    assertEquals(compute("hello world", ""), [
      {
        type: "delete",
        oldStart: 0,
        oldEnd: 11,
        newStart: 0,
        newEnd: 0,
        oldText: "hello world",
        newText: "",
      },
    ]);
  });

  Deno.test(name("both empty produces no hunks"), () => {
    assertEquals(compute("", ""), []);
  });

  Deno.test(name("single word replaced"), () => {
    const result = compute("The quick brown fox", "The slow brown fox");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "replace",
      oldText: "quick ",
      newText: "slow ",
    });
  });

  Deno.test(name("single word inserted"), () => {
    const result = compute("The brown fox", "The quick brown fox");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "insert",
      oldText: "",
      newText: "quick ",
    });
  });

  Deno.test(name("single word deleted"), () => {
    const result = compute("The quick brown fox", "The brown fox");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "delete",
      oldText: "quick ",
      newText: "",
    });
  });

  Deno.test(name("two separate changes"), () => {
    const result = compute(
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

  Deno.test(name("change at beginning"), () => {
    const result = compute("Hello world", "Goodbye world");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "replace",
      oldText: "Hello ",
      newText: "Goodbye ",
    });
  });

  Deno.test(name("prose: one word changed in paragraph"), () => {
    const oldContent = "The art of writing requires patience and dedication.";
    const newContent = "The art of writing requires patience and commitment.";
    const result = compute(oldContent, newContent);
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "replace",
      oldText: "dedication.",
      newText: "commitment.",
    });
  });

  Deno.test(name("prose: word inserted in paragraph"), () => {
    const oldContent = "Writing requires dedication.";
    const newContent = "Writing truly requires dedication.";
    const result = compute(oldContent, newContent);
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "insert",
      newText: "truly ",
    });
  });

  // Repeated `sentence. ` token: the linear-space Myers matches the second
  // occurrence, so the deleted / inserted text is "sentence. Second " (a valid
  // minimal edit, and the same on the JS and WASM cores).
  Deno.test(name("prose: sentence deleted"), () => {
    const oldContent = "First sentence. Second sentence. Third sentence.";
    const newContent = "First sentence. Third sentence.";
    const result = compute(oldContent, newContent);
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "delete",
      oldText: "sentence. Second ",
    });
  });

  Deno.test(name("prose: sentence inserted"), () => {
    const oldContent = "First sentence. Third sentence.";
    const newContent = "First sentence. Second sentence. Third sentence.";
    const result = compute(oldContent, newContent);
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "insert",
      newText: "sentence. Second ",
    });
  });

  Deno.test(name("prose: multiple paragraph changes"), () => {
    const result = compute(
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

  Deno.test(name("punctuation attached to words"), () => {
    const result = compute("Hello, world!", "Hello, universe!");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      oldText: "world!",
      newText: "universe!",
    });
  });

  Deno.test(name("multiple spaces between words"), () => {
    const result = compute("Hello  world", "Hello  universe");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      oldText: "world",
      newText: "universe",
    });
  });

  Deno.test(name("newlines are preserved in tokens"), () => {
    const result = compute("Line one.\nLine two.", "Line one.\nLine three.");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      oldText: "two.",
      newText: "three.",
    });
  });

  Deno.test(name("completely different content"), () => {
    const result = compute("abc def", "xyz uvw");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "replace",
      oldText: "abc def",
      newText: "xyz uvw",
    });
  });

  Deno.test(name("single character difference"), () => {
    const result = compute("cat", "car");
    assertEquals(result.length, 1);
    assertObjectMatch(result[0], {
      type: "replace",
      oldText: "cat",
      newText: "car",
    });
  });

  Deno.test(name("long prose with single word change"), () => {
    const result = compute(
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

  Deno.test(name("change hunk has correct offsets"), () => {
    assertEquals(compute("The quick brown fox", "The slow brown fox"), [
      {
        type: "replace",
        oldStart: 4,
        oldEnd: 10,
        newStart: 4,
        newEnd: 9,
        oldText: "quick ",
        newText: "slow ",
      },
    ]);
  });

  Deno.test(name("delete hunk has correct offsets"), () => {
    assertEquals(compute("The quick brown fox", "The brown fox"), [
      {
        type: "delete",
        oldStart: 4,
        oldEnd: 10,
        newStart: 4,
        newEnd: 4,
        oldText: "quick ",
        newText: "",
      },
    ]);
  });

  Deno.test(name("insert hunk has correct offsets"), () => {
    const result = compute("The brown fox", "The quick brown fox");
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

  Deno.test(name("two changes have correct offsets"), () => {
    const result = compute(
      "Alpha Beta Gamma Delta",
      "Alpha Modified Gamma Altered",
    );
    assertEquals(result, [
      {
        type: "replace",
        oldStart: 6,
        oldEnd: 11,
        newStart: 6,
        newEnd: 15,
        oldText: "Beta ",
        newText: "Modified ",
      },
      {
        type: "replace",
        oldStart: 17,
        oldEnd: 22,
        newStart: 21,
        newEnd: 28,
        oldText: "Delta",
        newText: "Altered",
      },
    ]);
  });
}
