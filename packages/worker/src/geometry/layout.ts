const SIDENOTE_GAP = 8;

export interface MarkedBlock {
  readonly key: string;
  readonly top: number;
  readonly height: number;
  readonly margin: number;
}

export interface MeasuredMark {
  readonly id: string;
  readonly top: number;
  readonly offset: number; // document offset, the mark-order tiebreak
}

export interface MeasuredBlock extends MarkedBlock {
  readonly marks: readonly MeasuredMark[]; // marks paired to this block by the measure pass
}

export interface MeasuredMarks {
  readonly blocks: readonly MeasuredBlock[];
}

export interface MeasuredSidenotes {
  readonly sidenotes: readonly {
    readonly id: string;
    readonly height: number;
  }[];
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
  readonly height: number; // measured
  margin: number; // measured inline margin, then the derived value
  readonly marks: readonly Mark[]; // document order
}

export class Layout {
  readonly #blocks: readonly Block[];
  readonly #sidenotes: ReadonlyMap<string, Sidenote>;

  constructor(measured: Measured) {
    this.#sidenotes = new Map<string, Sidenote>(
      measured.sidenotes.map(({ id, height }) => [id, { height, top: 0 }]),
    );
    // The layout's ordering happens here once: blocks ascend by top (the normalize and reflow walks
    // rely on it), each block's marks by top with the document offset, then id, breaking ties. Mark
    // records are copied because normalize mutates their tops.
    const blocks = measured.blocks.toSorted((a, b) => a.top - b.top);
    this.#blocks = blocks.map((block) => ({
      ...block,
      marks: block.marks
        .toSorted((a, b) => a.top - b.top || a.offset - b.offset || (a.id < b.id ? -1 : 1))
        .map(({ id, top }) => ({ id, top })),
    }));
  }

  normalize(): this {
    let offset = 0;
    for (const block of this.#blocks) {
      offset += block.margin;
      block.top -= offset;
      block.margin = 0;
      for (const mark of block.marks) mark.top -= offset;
    }
    return this;
  }

  reflow(): this {
    let cursor = Number.NEGATIVE_INFINITY;
    let offset = 0;
    for (const block of this.#blocks) {
      const first = block.marks[0];
      if (first !== undefined) {
        block.margin = Math.max(0, cursor + SIDENOTE_GAP - (first.top + offset));
        offset += block.margin;
      }
      for (const mark of block.marks) {
        const sidenote = this.#sidenotes.get(mark.id);
        if (sidenote === undefined) continue;
        const top = Math.max(mark.top + offset, cursor + SIDENOTE_GAP);
        sidenote.top = top;
        cursor = top + sidenote.height;
      }
    }
    return this;
  }

  get margins(): ReadonlyMap<string, number> {
    const margins = new Map<string, number>();
    for (const { key, margin } of this.#blocks) {
      if (margin !== 0) margins.set(key, margin);
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
