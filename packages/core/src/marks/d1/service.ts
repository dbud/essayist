/** Review marks as an Effect service, scoped to the current workspace. */

import { Context, type Effect } from "effect";

import type { FileMissingError } from "#/files/d1/types.ts";
import type { PersistenceError } from "#/persistence/service.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import type { Mark, MarkTextNotFoundError } from "./types.ts";

export interface MarkInput {
  fileId: string;
  versionId: string;
  runId: string;
  selectedText: string;
  comment: string;
  categoryId?: string;
  /** The line to search near, when the text appears more than once. */
  lineHint?: number;
  contextSpan?: number;
}

export interface Interface {
  /** Place a mark: find the text in the version, capture the context around it, and store it. */
  mark(
    input: MarkInput,
  ): Effect.Effect<Mark, PersistenceError | FileMissingError | MarkTextNotFoundError, WorkspaceId>;
  /** The marks of a run, oldest first. */
  ofRun(runId: string): Effect.Effect<ReadonlyArray<Mark>, PersistenceError, WorkspaceId>;
}

export class Marks extends Context.Service<Marks, Interface>()("@essayist/core/marks/Marks") {}
