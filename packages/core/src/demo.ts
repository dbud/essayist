// The demo essay content and its seed: one copy, shared by web's boot
// seed and workspace-create endpoint, and by kvctl's seed-demo
// command. Seeding is an Effect against the files and marks services
// under the caller's WorkspaceId scope.

import { Effect } from "effect";
import { Files } from "#/files/service.ts";
import { Marks } from "#/marks/service.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "#/persistence/mod.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

/** The demo essay content, keyed by workspace path. Paragraphs are
 * single lines so mark selections can match exact substrings without
 * whitespace ambiguity. */
export const demoFiles: Record<string, string> = {
  "essay.md": `# On Drafts

Every piece of writing begins as a draft, and every draft begins as an excuse. The blank page promises nothing, so the first draft exists to give the second draft something to argue with. Treating a first pass as finished work protects it; treating it as raw material improves it.

## First Thoughts

The useful fiction about first drafts is that they are private. Nobody reads them, so they can be honest. A first draft can admit that a section does not work yet, or lean on a stock phrase while it waits for the right one. That freedom is temporary -- revision is the process of paying for it -- but while it lasts, it lets a writer find out what the piece is actually about.

What surprises most new writers is how much of the work happens after the draft exists. The psychologist Ronald Kellogg described composing as three activities that share one mind: planning what to say, translating intention into sentences, and reviewing what appears on the page. Expert writers spend more of their time reviewing than beginners do, not less. The draft is not the end of writing; it is the switch that turns writing into editing.

## The Case for Ugly Drafts

An ugly draft is not a failed draft. A sentence that says the wrong thing in eight words can be repaired. A page that says nothing at all cannot be repaired, because there is nothing there to work on. This is why drafting and editing fight each other when they run at the same time: the internal editor wants every line to be defensible, and that demand slows the production of raw material to a crawl.

The fix is procedural rather than motivational. Write badly on purpose, then edit ruthlessly, and keep the two jobs in separate rooms. Writers who cannot tolerate their own bad prose usually write less, and writers who write less improve more slowly than writers who keep producing material to fix.

## Reading Like a Stranger

Revision has an order of operations. Structure comes before paragraphs, paragraphs before sentences, and words last, because polishing a sentence inside a paragraph that is about to be cut is work thrown away. Reading the draft as a stranger would, without the charity extended to yesterday's intentions, is what makes that ordering visible.

Distance does the rest. Setting a draft aside for a day is the cheapest revision tool there is, and the gap between how the piece felt when it was written and how it reads a day later is exactly the information a revision needs.

## Small Mechanics

Some flaws are architectural, but plenty are local. A paragraph that opens three sentences with the same subject sags. A sentence stuffed with qualifiers hedges its own point into silence. Neither flaw is fatal, and both are cheap to fix once someone points at them.

The comma deserves special mention, because it is the smallest tool in the kit and the most abused. A comma splice joins two independent clauses with nothing but a comma, and readers feel the joint creak even when they cannot name the fault. The remedy is usually simple: split the sentence, or add a conjunction that earns the connection.

## Endings

An ending has to be earned twice -- once by the argument, and once by the reader's patience. The best endings rarely summarize. They return to the opening question carrying an answer the middle of the piece has made credible, and then they stop. A draft that knows where it is going can afford to walk; a revision knows the way, and can run.`,
};

/** Write the demo essay and seed marks exercising every label; the
 * workspace scope comes from the caller. Idempotence (skip when the
 * essay already exists) is the caller's job, since a write appends a
 * new version and marks would duplicate. */
export function seedDemoFiles(): Effect.Effect<
  void,
  PersistenceError | ConcurrentModificationError,
  Files | Marks | WorkspaceId
> {
  return Effect.gen(function* () {
    const files = yield* Files;
    const marks = yield* Marks;
    for (const [path, content] of Object.entries(demoFiles)) {
      yield* files.write(path, content);
    }

    yield* marks.mark(
      "essay.md",
      "The blank page promises nothing, so the first draft exists to give the second draft something to argue with.",
      "The claim the whole piece defends. Keep it early and unqualified.",
      { label: "thesis" },
    );

    // Long mark spanning two paragraphs; fully contains the evidence mark
    // below, exercising nested/overlapping mark rendering and band
    // stacking.
    yield* marks.mark(
      "essay.md",
      `The useful fiction about first drafts is that they are private. Nobody reads them, so they can be honest. A first draft can admit that a section does not work yet, or lean on a stock phrase while it waits for the right one. That freedom is temporary -- revision is the process of paying for it -- but while it lasts, it lets a writer find out what the piece is actually about.

What surprises most new writers is how much of the work happens after the draft exists. The psychologist Ronald Kellogg described composing as three activities that share one mind: planning what to say, translating intention into sentences, and reviewing what appears on the page. Expert writers spend more of their time reviewing than beginners do, not less. The draft is not the end of writing; it is the switch that turns writing into editing.`,
      "The section carries the main argument. Consider a sharper topic sentence for the second paragraph.",
      { label: "structure" },
    );
    yield* marks.mark(
      "essay.md",
      "Expert writers spend more of their time reviewing than beginners do, not less.",
      "Kellogg's model earns this generalization; name the book or study when you cite it.",
      { label: "evidence" },
    );

    // No label: exercises the ink fallback alongside categorized marks.
    yield* marks.mark(
      "essay.md",
      "Setting a draft aside for a day is the cheapest revision tool there is",
      "The distance point repeats; consider cutting one of the two.",
    );
    yield* marks.mark(
      "essay.md",
      "Neither flaw is fatal, and both are cheap to fix once someone points at them.",
      "The dry, even register here is the voice of the piece; hold it through the mechanics section.",
      { label: "tone" },
    );
    yield* marks.mark(
      "essay.md",
      "A comma splice joins two independent clauses with nothing but a comma",
      "Concrete usage note; the piece could use one or two more like this.",
      { label: "grammar" },
    );
  });
}
