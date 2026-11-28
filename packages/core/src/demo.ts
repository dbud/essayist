// The demo essay and its seed: the essay with a review of it, under the WorkspaceId of the caller.

import { Effect } from "effect";

import { DEFAULT_REVIEW_PASS_ID } from "#/config/defaults.ts";
import { ReviewConfig } from "#/config/service.ts";
import { Files } from "#/files/service.ts";
import type { FileExistsError, FileTooLargeError } from "#/files/types.ts";
import { Marks } from "#/marks/service.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

/** The demo essay content, keyed by workspace path. Paragraphs are
 * single lines so mark selections can match exact substrings without whitespace ambiguity. */
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

/** The comments of the demo review, in the categories of the default config. */
const demoMarks: ReadonlyArray<{ selectedText: string; comment: string; categoryId?: string }> = [
  {
    categoryId: "thesis",
    selectedText:
      "The blank page promises nothing, so the first draft exists to give the second draft something to argue with.",
    comment: "The claim the whole piece defends. Keep it early and unqualified.",
  },
  // spans two paragraphs and contains the evidence mark below, for nested and overlapping marks
  {
    categoryId: "structure",
    selectedText: `The useful fiction about first drafts is that they are private. Nobody reads them, so they can be honest. A first draft can admit that a section does not work yet, or lean on a stock phrase while it waits for the right one. That freedom is temporary -- revision is the process of paying for it -- but while it lasts, it lets a writer find out what the piece is actually about.

What surprises most new writers is how much of the work happens after the draft exists. The psychologist Ronald Kellogg described composing as three activities that share one mind: planning what to say, translating intention into sentences, and reviewing what appears on the page. Expert writers spend more of their time reviewing than beginners do, not less. The draft is not the end of writing; it is the switch that turns writing into editing.`,
    comment:
      "The section carries the main argument. Consider a sharper topic sentence for the second paragraph.",
  },
  {
    categoryId: "evidence",
    selectedText: "Expert writers spend more of their time reviewing than beginners do, not less.",
    comment: "Kellogg's model earns this generalization; name the book or study when you cite it.",
  },
  // no category, for the ink fallback
  {
    selectedText: "Setting a draft aside for a day is the cheapest revision tool there is",
    comment: "The distance point repeats; consider cutting one of the two.",
  },
  {
    categoryId: "tone",
    selectedText: "Neither flaw is fatal, and both are cheap to fix once someone points at them.",
    comment:
      "The dry, even register here is the voice of the piece; hold it through the mechanics section.",
  },
  {
    categoryId: "grammar",
    selectedText: "A comma splice joins two independent clauses with nothing but a comma",
    comment: "Concrete usage note; the piece could use one or two more like this.",
  },
];

/**
 * Create the demo essay with a completed review of its first version. Fails with FileExistsError
 * when the essay is already there, so seeding twice changes nothing. A mark keeps its category only
 * when the config has it.
 */
export function seedDemoFiles(): Effect.Effect<
  void,
  FileExistsError | FileTooLargeError,
  Files | Marks | ReviewConfig | ReviewRuns | WorkspaceId
> {
  return Effect.gen(function* () {
    const { file, version } = yield* Files.use((files) =>
      files.createAt("essay.md", demoFiles["essay.md"]),
    );
    const runs = yield* ReviewRuns;
    const run = yield* Effect.orDie(
      runs.createRun({
        fileId: file.id,
        versionId: version.id,
        reviewPassId: DEFAULT_REVIEW_PASS_ID,
      }),
    );
    const categories = yield* ReviewConfig.use((config) => config.listCategories());
    const knownIds = new Set(categories.map((category) => category.id));
    const marks = yield* Marks;
    for (const { categoryId, ...mark } of demoMarks) {
      yield* Effect.orDie(
        marks.mark({
          ...mark,
          categoryId: categoryId !== undefined && knownIds.has(categoryId) ? categoryId : undefined,
          fileId: file.id,
          versionId: version.id,
          runId: run.id,
        }),
      );
    }
    yield* Effect.orDie(runs.completeRun(run.id, "A demo review of the essay."));
  });
}
