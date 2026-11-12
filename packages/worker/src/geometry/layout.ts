const SIDENOTE_GAP = 8;

export interface MeasuredBlock {
  readonly key: string;
  readonly top: number;
  readonly height: number;
  readonly before: number;
  readonly after: number;
  readonly marks: readonly MeasuredMark[]; // ordered
}

export interface Spacer {
  readonly before: number; // space above the block's text
  readonly after: number; // space below the block's text
}

export interface MeasuredMark {
  readonly id: string;
  readonly top: number;
}

export interface MeasuredMarks {
  readonly blocks: readonly MeasuredBlock[]; // ordered
}

export interface MeasuredSidenote {
  readonly id: string;
  readonly height: number;
}

export interface MeasuredSidenotes {
  readonly sidenotes: readonly MeasuredSidenote[];
}

export interface Measured extends MeasuredMarks, MeasuredSidenotes {}

interface Mark {
  readonly id: string;
  top: number; // normalized, then laid out
}

interface Sidenote {
  readonly height: number; // measured
  top: number; // stacked top, assigned by layout
}

interface Block {
  readonly key: string;
  top: number; // measured, then normalized, then laid out
  readonly height: number;
  before: number; // measured spacer, then the derived push
  after: number; // measured spacer, cleared by normalize
  readonly marks: readonly Mark[];
}

export class Layout {
  readonly #blocks: readonly Block[];
  readonly #sidenotes: ReadonlyMap<string, Sidenote>;

  constructor(measured: Measured) {
    this.#sidenotes = new Map<string, Sidenote>(
      measured.sidenotes.map(({ id, height }) => [id, { height, top: 0 }]),
    );
    // Mark records are copied because normalize mutates their tops.
    this.#blocks = measured.blocks.map((block) => ({
      ...block,
      marks: block.marks.map(({ id, top }) => ({ id, top })),
    }));
    this.#normalize();
    this.#reflow();
  }

  #normalize(): void {
    let offset = 0; // the spacer height of all blocks above
    for (const block of this.#blocks) {
      block.top -= offset;
      for (const mark of block.marks) mark.top -= offset + block.before;
      offset += block.before + block.after;
      block.before = 0;
      block.after = 0;
    }
  }

  #reflow(): void {
    let cursor = Number.NEGATIVE_INFINITY;
    let offset = 0;
    let previous: Block | undefined = undefined;
    for (const block of this.#blocks) {
      const first = block.marks[0];
      const needed =
        first === undefined ? 0 : Math.max(0, cursor + SIDENOTE_GAP - (first.top + offset));
      // The push goes to the end of the block above: same effect as a spacer over this block, and
      // the void stays with the discussion that caused it. The first block has no block above, so
      // the push goes above its own text.
      if (previous === undefined) {
        block.before = needed;
        offset += needed;
      } else {
        previous.after = needed;
        offset += needed;
      }
      for (const mark of block.marks) {
        const sidenote = this.#sidenotes.get(mark.id);
        if (sidenote === undefined) continue;
        const top = Math.max(mark.top + offset, cursor + SIDENOTE_GAP);
        sidenote.top = top;
        cursor = top + sidenote.height;
      }
      previous = block;
    }
  }

  get margins(): ReadonlyMap<string, Spacer> {
    const margins = new Map<string, Spacer>();
    for (const { key, before, after } of this.#blocks) {
      if (before !== 0 || after !== 0) margins.set(key, { before, after });
    }
    return margins;
  }

  get sidenoteTops(): ReadonlyMap<string, number> {
    const sidenoteTops = new Map<string, number>();
    for (const { marks } of this.#blocks) {
      for (const { id } of marks) {
        const sidenote = this.#sidenotes.get(id);
        if (sidenote !== undefined) sidenoteTops.set(id, sidenote.top);
      }
    }
    return sidenoteTops;
  }
}
