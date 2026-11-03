/**
 * Plain id generation, safe for the client bundle: tests inject a deterministic generator through
 * the Ids reference in idsRef.ts.
 */

/** A fresh v4 UUID; unique without persistence. */
export const randomId = (): string => crypto.randomUUID();

export interface IdGenerator {
  next(): string;
}

/** The default generator, for callers outside an Effect. */
export const nextId = (): string => randomId();
