const SIDENOTE_GAP = 8;

export interface Measured {
  readonly blocks: readonly {
    readonly key: string;
    readonly top: number;
    readonly height: number;
    readonly margin: number;
  }[];
  readonly marks: readonly {
    readonly blockKey: string;
    readonly threadId: string;
    readonly top: number;
  }[];
  readonly sidenotes: readonly {
    readonly threadId: string;
    readonly height: number;
  }[];
}

interface Mark {
  readonly threadId: string;
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
      measured.sidenotes.map(({ threadId, height }) => [threadId, { height, top: 0 }]),
    );
    const byBlock = new Map<string, Mark[]>();
    for (const { blockKey, threadId, top } of measured.marks) {
      byBlock.getOrInsert(blockKey, []).push({ threadId, top });
    }
    this.#blocks = measured.blocks.map((block) => ({
      ...block,
      marks: byBlock.get(block.key) ?? [],
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
        const sidenote = this.#sidenotes.get(mark.threadId);
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
      for (const { threadId } of marks) {
        const sidenote = this.#sidenotes.get(threadId);
        if (sidenote !== undefined) sidenoteTops.set(threadId, sidenote.top);
      }
    }
    return sidenoteTops;
  }
}
