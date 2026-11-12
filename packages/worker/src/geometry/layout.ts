const SIDENOTE_GAP = 8;

export interface MarkedBlock {
  readonly key: string;
  readonly top: number;
  readonly height: number;
  readonly margin: number;
}

export interface Measured {
  readonly blocks: readonly MarkedBlock[];
  readonly marks: readonly {
    readonly id: string;
    readonly top: number;
  }[];
  readonly sidenotes: readonly {
    readonly id: string;
    readonly height: number;
  }[];
}

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
    // Marks attach to the block whose box contains their line top; a mark outside every marked
    // block box is skipped. Blocks tile the column, so each top falls into exactly one block. TODO
    // -- REFACTOR
    const byBlock: Mark[][] = measured.blocks.map(() => []);
    for (const { id, top } of measured.marks) {
      const index = measured.blocks.findIndex(
        (block) => block.top <= top && top < block.top + block.height,
      );
      if (index !== -1) byBlock[index].push({ id, top });
    }
    this.#blocks = measured.blocks.map((block, i) => ({
      ...block,
      marks: byBlock[i],
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
