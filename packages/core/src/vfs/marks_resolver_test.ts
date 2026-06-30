import { assertEquals } from "@std/assert";
import { assertObjectMatch } from "@std/assert/object-match";
import { type ResolveOptions, resolveMarks } from "./marks_resolver.ts";
import type { Mark } from "./types.ts";

function createMark(
  overrides: Partial<Mark> & { selected_text: string },
): Mark {
  const {
    id = `mark_${Math.random().toString(36).slice(2)}`,
    thread_id,
    path = "test.txt",
    version_id = "v1",
    selected_text,
    before_context = "",
    after_context = "",
    comment = "test comment",
    label,
    created_at = 1000,
    offset = 0,
    length = selected_text.length,
    status = "resolved",
  } = overrides;

  return {
    id,
    thread_id: thread_id ?? `thread_${id}`,
    path,
    version_id,
    selected_text,
    before_context,
    after_context,
    comment,
    label,
    created_at,
    offset,
    length,
    status,
  };
}

function resolve(
  marks: Mark[],
  oldContent: string,
  newContent: string,
  options?: ResolveOptions,
): Mark[] {
  return resolveMarks(
    { marks, oldContent, newContent },
    options as Parameters<typeof resolveMarks>[1],
  );
}

// -- Arithmetic mapping (unchanged region) --

Deno.test("resolveMarks -- pure insertion inside mark region (no division by zero)", () => {
  /*
    old: "It has been used as a typing test since the late 1800s."
    new: "It has been used as a typing test since the aaaaaa late 1800s."
                                                      ^^^^^^
                                                      inserted "aaaaaa " inside the mark region

    The diff hunk is a pure insertion (oldStart == oldEnd) fully inside the mark.
    The mark expands to include the inserted text.
  */
  const oldContent = "It has been used as a typing test since the late 1800s.";
  const newContent =
    "It has been used as a typing test since the aaaaaa late 1800s.";
  const insertionLen = "aaaaaa ".length;
  const markStart = oldContent.indexOf("since the late");
  const marks = [
    createMark({
      selected_text: "since the late",
      offset: markStart,
      before_context: "It has been used as a typing test ",
      after_context: " 1800s.",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: markStart,
    length: "since the late".length + insertionLen,
    selected_text: newContent.slice(
      markStart,
      markStart + "since the late".length + insertionLen,
    ),
  });
});

Deno.test("resolveMarks -- insertion before mark shifts offset right", () => {
  /*
    "The fox jumps"
    "The quick fox jumps"
         ^^^^^^
         "quick " inserted before mark

    mark: "fox" at offset 4 -> offset 10
  */
  const oldContent = "The fox jumps";
  const newContent = "The quick fox jumps";
  const marks = [createMark({ selected_text: "fox", offset: 4 })];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", offset: 10 });
});

Deno.test("resolveMarks -- deletion before mark shifts offset left", () => {
  /*
    "The quick brown fox"
    "The brown fox"
         ^^^^^^
         "quick " deleted before mark

    mark: "brown" at offset 10 -> offset 4
  */
  const oldContent = "The quick brown fox";
  const newContent = "The brown fox";
  const marks = [createMark({ selected_text: "brown", offset: 10 })];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", offset: 4 });
});

Deno.test("resolveMarks -- multiple edits before mark, cumulative delta", () => {
  /*
    "Alpha. Beta. Gamma. Delta."
    "One. Two. Gamma. Delta."
     ^^^^^^^^

    mark: "Gamma" at offset 13 -> offset 10
  */
  const oldContent = "Alpha. Beta. Gamma. Delta.";
  const newContent = "One. Two. Gamma. Delta.";
  const marks = [createMark({ selected_text: "Gamma", offset: 13 })];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: newContent.indexOf("Gamma"),
  });
});

Deno.test("resolveMarks -- edit after mark, offset unchanged", () => {
  /*
    "The fox jumps over"
    "The fox leaps over"
             ^^^^^
             "jumps" -> "leaps" (after the mark)

    mark: "The " at offset 0 -> offset 0
  */
  const oldContent = "The fox jumps over";
  const newContent = "The fox leaps over";
  const marks = [createMark({ selected_text: "The ", offset: 0 })];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", offset: 0 });
});

Deno.test("resolveMarks -- identical content, offset unchanged", () => {
  const content = "The quick brown fox";
  const marks = [createMark({ selected_text: "quick", offset: 4 })];

  const result = resolve(marks, content, content);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", offset: 4 });
});

// -- Phase 1: selected text found (exact or fuzzy) --

Deno.test("resolveMarks -- minor typo fix inside marked text (fuzzy)", () => {
  /*
    "The quick brown fox"
    "The quik brown fox"
         ^^^^
         "quick" -> "quik" (1 char deletion)

    similarity: 4/5 = 80%, at default threshold
    Phase 1: fuzzy match finds "quik" near expected offset
  */
  const oldContent = "The quick brown fox";
  const newContent = "The quik brown fox";
  const marks = [
    createMark({
      selected_text: "quick",
      offset: 4,
      before_context: "The ",
      after_context: " brown",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    selected_text: "quik",
    offset: 4,
  });
});

// -- Phase 2: context-driven resolution --

Deno.test("resolveMarks -- single word substituted (Phase 1 fails, Phase 2 resolves)", () => {
  /*
    "The quick brown fox"
    "The slow brown fox"
              ^^^^
              "quick" -> "slow"

    Phase 1: "quick" vs "slow" = 1/5 = 20% similarity -> fails
    Phase 2: before_context "The " matches, after_context " brown" matches
             gap = "slow" -> resolved
  */
  const oldContent = "The quick brown fox";
  const newContent = "The slow brown fox";
  const marks = [
    createMark({
      selected_text: "quick",
      offset: 4,
      before_context: "The ",
      after_context: " brown",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", selected_text: "slow" });
});

Deno.test("resolveMarks -- sentence completely rewritten, both contexts intact", () => {
  /*
    old: "Writing is a craft that requires patience and dedication."
    new: "Writing is an art that demands patience and dedication."

    before_context: "Writing is ",
    selected_text:  "a craft that requires",
    after_context:  " patience and dedication"

    Phase 1: "a craft that requires" vs "an art that demands" -> low similarity
    Phase 2: before_context "Writing is " matches identically
             after_context " patience and dedication" matches identically
             gap = "an art that demands" -> resolved
  */
  const oldContent =
    "Writing is a craft that requires patience and dedication.";
  const newContent = "Writing is an art that demands patience and dedication.";
  const marks = [
    createMark({
      selected_text: "a craft that requires",
      offset: 11,
      before_context: "Writing is ",
      after_context: " patience and dedication",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 11,
    selected_text: "an art that demands",
  });
});

Deno.test("resolveMarks -- paragraph rewritten, context fuzzy-matches at boundary", () => {
  /*
    old: "The conclusion of the previous section was clear and well supported. The entire paragraph needs complete revision. The next section begins with an introduction."
    new: "The conclusion of the previous section was clear and somewhat supported. The entire paragraph was completely rewritten from scratch. The next section begins with an introduction."

    The user rewrote the marked paragraph and tweaked the sentence before it.

    before_context: "The conclusion of the previous section was clear and well supported. "
    selected_text:  "The entire paragraph needs complete revision."
    after_context:  " The next section begins with an introduction."

    Phase 1: selected text completely changed -> low similarity -> fails
    Phase 2: before_context fuzzy-matches (1 word changed in a long string)
             after_context matches exactly
             gap = "The entire paragraph was completely rewritten from scratch." -> resolved
  */
  const oldContent =
    "The conclusion of the previous section was clear and well supported. The entire paragraph needs complete revision. The next section begins with an introduction.";
  const newContent =
    "The conclusion of the previous section was clear and somewhat supported. The entire paragraph was completely rewritten from scratch. The next section begins with an introduction.";
  const marks = [
    createMark({
      selected_text: "The entire paragraph needs complete revision.",
      offset: oldContent.indexOf(
        "The entire paragraph needs complete revision.",
      ),
      before_context:
        "The conclusion of the previous section was clear and well supported. ",
      after_context: " The next section begins with an introduction.",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 70,
    length: 62,
    selected_text: // trailing "d. " because of fuzzy-matching
      "d. The entire paragraph was completely rewritten from scratch.",
  });
});

Deno.test("resolveMarks -- sentence deleted, contexts abut, zero-length resolved mark", () => {
  /*
    old: "Keep this.Delete this.Keep that."
    new: "Keep this.Keep that."

    before_context: "Keep this."
    selected_text:  "Delete this."
    after_context:  "Keep that."

    Phase 1: "Delete this." not found -> fails
    Phase 2: before_context "Keep this." matches at offset 0
             after_context "Keep that." matches at offset 10
             gap = "" (zero-length, contexts abut)
             "Delete this." doesn't exist elsewhere -> resolved zero-length
  */
  const oldContent = "Keep this.Delete this.Keep that.";
  const newContent = "Keep this.Keep that.";
  const marks = [
    createMark({
      selected_text: "Delete this.",
      offset: oldContent.indexOf("Delete this."),
      before_context: "Keep this.",
      after_context: "Keep that.",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    length: 0,
    offset: newContent.indexOf("Keep that."),
  });
});

Deno.test("resolveMarks -- long context with small edit near boundary", () => {
  /*
    Context is long (~200 chars) and covers the edited region.
    Fuzzy matching should still find it because most of the context is unchanged.

    old: "<200 chars preamble> The marked text. <200 chars postamble>"
    new: "<same preamble> Completely rewritten. <same postamble>"

    A small change at the far end of a long context string still yields high similarity.
  */
  const preamble = "This is a long preamble that provides context. ".repeat(4);
  const postamble =
    " This is a long postamble that provides trailing context. ".repeat(4);
  const oldContent = `${preamble}The marked text.${postamble}`;
  const newContent = `${preamble}Completely rewritten.${postamble}`;

  const marks = [
    createMark({
      selected_text: "The marked text.",
      offset: preamble.length,
      before_context: preamble,
      after_context: postamble,
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: newContent.indexOf("Completely rewritten."),
    selected_text: "Completely rewritten.",
  });
});

Deno.test("resolveMarks -- only before_context matches, stale zero-length at end of match", () => {
  /*
    old: "The quick brown fox jumps over the lazy dog."
    new: "The quick brown cat leaps over something entirely different."

    before_context: "The quick brown "
    selected_text:  "fox"
    after_context:  " jumps over the lazy dog"

    Phase 1: "fox" not found near expected offset -> fails
    Phase 2: before_context "The quick brown " matches
             after_context " jumps over the lazy dog" vs " leaps over something..."
             fuzzy similarity too low -> fails
    -> only one context matches -> stale, zero-length at end of before_context match
  */
  const oldContent = "The quick brown fox jumps over the lazy dog.";
  const newContent =
    "The quick brown cat leaps over something entirely different.";
  const marks = [
    createMark({
      selected_text: "fox",
      offset: oldContent.indexOf("fox"),
      before_context: "The quick brown ",
      after_context: " jumps over the lazy dog",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "stale",
    length: 0,
    offset: "The quick brown ".length,
  });
});

Deno.test("resolveMarks -- only after_context matches, stale zero-length at start of match", () => {
  /*
    old: "The opening sentence was changed completely. The quick brown fox jumps over the lazy dog."
    new: "Totally new opening here. A fast gray cat leaps over the lazy dog."

    before_context: "The opening sentence was changed completely. "
    selected_text:  "The quick brown fox"
    after_context:  " jumps over the lazy dog"

    Phase 1: "The quick brown fox" not found -> fails
    Phase 2: before_context -> too different, fails
             after_context " jumps over the lazy dog" fuzzy-matches
               " leaps over the lazy dog" (high similarity, 1 word diff)
             -> only one context matches -> stale, zero-length at start of after_context match
  */
  const oldContent =
    "The opening sentence was changed completely. The quick brown fox jumps over the lazy dog.";
  const newContent =
    "Totally new opening here. A fast gray cat leaps over the lazy dog.";
  const marks = [
    createMark({
      selected_text: "The quick brown fox",
      offset: oldContent.indexOf("The quick brown fox"),
      before_context: "The opening sentence was changed completely. ",
      after_context: " jumps over the lazy dog",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "stale",
    length: 0,
    offset: newContent.indexOf(" leaps over the lazy dog"),
  });
});

Deno.test("resolveMarks -- empty before_context (mark at content start)", () => {
  /*
    old: "Hello world today"
    new: "Goodbye world today"

    before_context: "" (empty -- mark starts at content beginning)
    selected_text:  "Hello"
    after_context:  " world"

    Phase 1: "Hello" not found -> fails
    Phase 2: no before_context to match
             after_context " world" matches exactly
             -> only one context matches -> resolved to gap from content start
               to start of after_context
  */
  const oldContent = "Hello world today";
  const newContent = "Goodbye world today";
  const marks = [
    createMark({
      selected_text: "Hello",
      offset: 0,
      before_context: "",
      after_context: " world",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 0,
    length: newContent.indexOf(" world"),
    selected_text: "Goodbye",
  });
});

Deno.test("resolveMarks -- empty after_context (mark at content end)", () => {
  /*
    old: "Hello world today"
    new: "Hello world yesterday"

    before_context: "Hello world "
    selected_text:  "today"
    after_context:  "" (empty -- mark ends at content end)

    Phase 1: "today" not found -> fails
    Phase 2: before_context "Hello world " matches exactly
             no after_context to match
             -> only one context matches -> resolved to gap from end of before_context
                        to content end
           */
  const oldContent = "Hello world today";
  const newContent = "Hello world yesterday";
  const marks = [
    createMark({
      selected_text: "today",
      offset: oldContent.indexOf("today"),
      before_context: "Hello world ",
      after_context: "",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  const offset = "Hello world ".length;
  assertObjectMatch(result[0], {
    status: "resolved",
    offset,
    length: newContent.length - offset,
    selected_text: "yesterday",
  });
});

Deno.test("resolveMarks -- both contexts empty (selected_text is entire content)", () => {
  /*
    old: "Hello world"
    new: "Goodbye world"

    before_context: "" (empty)
    selected_text:  "Hello world"
    after_context: "" (empty)

    Phase 1: "Hello world" not found -> fails
    Phase 2: no contexts to match -> fails
    Phase 3: "Hello world" not found anywhere -> stale
  */
  const oldContent = "Hello world";
  const newContent = "Goodbye world";
  const marks = [
    createMark({
      selected_text: "Hello world",
      offset: 0,
      before_context: "",
      after_context: "",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "stale", offset: 0, length: 0 });
});

// -- Phase 3: full-content exact match (moved text) --

Deno.test("resolveMarks -- selected text cut and pasted elsewhere", () => {
  /*
    old: "First part. Middle part. Last part."
    new: "First part. Last part. Middle part."

    before_context: "First part. "
    selected_text:  "Middle part"
    after_context:  " Last part"

    Phase 1: "Middle part" not near original offset -> fails
    Phase 2: before_context "First part. " matches at offset 0
             after_context " Last part" matches at offset 10
             gap is empty -> contexts abut, selected text was moved
             fall through to Phase 3
    Phase 3: "Middle part" found via full-content scan -> resolved at new location
  */
  const oldContent = "First part. Middle part. Last part.";
  const newContent = "First part. Last part. Middle part.";
  const marks = [
    createMark({
      selected_text: "Middle part",
      offset: oldContent.indexOf("Middle part"),
      before_context: "First part. ",
      after_context: " Last part",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: newContent.indexOf("Middle part"),
  });
});

Deno.test("resolveMarks -- Phase 3 finds moved text when contexts become adjacent", () => {
  /*
    The selected text appears in the new content but far from the
    expected offset. Phase 1's search radius is too small to reach it.
    Phase 2 finds both contexts adjacent (empty gap).
    Phase 3 full-content scan finds the nearest occurrence.
  */
  const selected = "selected_text";
  const before = "BEFORE";
  const after = "AFTER";
  const filler = "filler. ";

  const oldContent =
    filler + filler + before + selected + after + filler + filler;
  const newContent =
    selected + filler + filler + filler + before + after + filler;

  const marks = [
    createMark({
      selected_text: selected,
      offset: oldContent.indexOf(selected),
      before_context: before,
      after_context: after,
    }),
  ];

  // With tiny search radius, Phase 1 can't reach selected_text at offset 0.
  // Phase 2 finds BEFORE/AFTER adjacent -> empty gap -> fall through.
  // Phase 3 finds selected_text at offset 0.
  const result = resolve(marks, oldContent, newContent, {
    minSearchRadius: 2,
    searchRadiusMultiplier: 1,
  });

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 0,
    length: 13,
    selected_text: "selected_text",
  });
});

// -- Stale --

Deno.test("resolveMarks -- marked region and all context deleted entirely", () => {
  /*
    old: "Unique preamble. Marked text. Unique postamble."
    new: "Completely different content with no overlap."

    Phase 1: "Marked text" not found -> fails
    Phase 2: before_context "Unique preamble. " -> not found -> fails
             after_context " Unique postamble" -> not found -> fails
    Phase 3: "Marked text" not found -> stale
  */
  const oldContent = "Unique preamble. Marked text. Unique postamble.";
  const newContent = "Completely different content with no overlap.";
  const marks = [
    createMark({
      selected_text: "Marked text",
      offset: oldContent.indexOf("Marked text"),
      before_context: "Unique preamble. ",
      after_context: " Unique postamble",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "stale", length: 0 });
});

// -- Options/parameters --

Deno.test("resolveMarks -- separate contextFuzzyThreshold vs selectedTextFuzzyThreshold", () => {
  /*
    old: "The quick brown fox jumps over the lazy dog."
    new: "The quik brown fox leaps over the lazy dog."

    before_context: "The "
    selected_text:  "quick"
    after_context: " brown"

    selected_text "quick" -> "quik" = 80% similarity
    context "The " -> "The " = 100% (unchanged)
    context " brown" -> " brown" = 100% (unchanged)

    With selectedTextFuzzyThreshold = 0.85 and contextFuzzyThreshold = 0.7:
    Phase 1: 80% < 85% -> fails
    Phase 2: contexts match at 100% > 70% -> resolves to "quik"
  */
  const oldContent = "The quick brown fox jumps over the lazy dog.";
  const newContent = "The quik brown fox leaps over the lazy dog.";
  const marks = [
    createMark({
      selected_text: "quick",
      offset: 4,
      before_context: "The ",
      after_context: " brown",
    }),
  ];

  const result = resolve(marks, oldContent, newContent, {
    selectedTextFuzzyThreshold: 0.85,
    contextFuzzyThreshold: 0.7,
  });

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], { status: "resolved", selected_text: "quik" });
});

Deno.test("resolveMarks -- insertion inside a mark spanning multiple lines", () => {
  /*
    Mark spans the entire content. A insertion (".     ") is made inside
    the mark (after "fox"). The mark should expand to include the
    inserted text.
  */
  const oldContent = [
    "The quick brown fox jumps over the lazy dog.",
    "This sentence contains every letter of the alphabet.",
    "It has been used as a typing test since the late 1800s.",
  ].join("\n");
  const newContent =
    "The quick brown fox.     jumps over the lazy dog." +
    "\n" +
    "This sentence contains every letter of the alphabet." +
    "\n" +
    "It has been used as a typing test since the late 1800s.";
  const marks = [
    createMark({
      selected_text: oldContent,
      offset: 0,
      length: oldContent.length,
      before_context: "",
      after_context: "",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 0,
    length: newContent.length,
    selected_text: newContent,
  });
});

Deno.test("resolveMarks -- deletion and insertion inside full-content mark", () => {
  /*
    old: "The quick brown fox jumps over a lazy dog"
    new: "The quick fox jumps over a very lazy dog"
                    ^^^^^^           ^^^^
                    deleted "brown   inserted "very

    Mark spans the entire old content. The mark should shrink by the
    deletion and grow by the insertion.
  */
  const oldContent = "The quick brown fox jumps over a lazy dog";
  const newContent = "The quick fox jumps over a very lazy dog";

  const marks = [
    createMark({
      selected_text: oldContent,
      offset: 0,
      length: oldContent.length,
      before_context: "",
      after_context: "",
    }),
  ];

  const result = resolve(marks, oldContent, newContent);

  assertEquals(result.length, 1);
  assertObjectMatch(result[0], {
    status: "resolved",
    offset: 0,
    length: newContent.length,
    selected_text: newContent,
  });
});
