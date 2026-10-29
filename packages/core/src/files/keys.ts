/**
 * The Files service key layout: workspace-scoped tuple keys. The builders are pure, so tests and
 * tooling can compute the same paths.
 *
 * parfit-ignore
 * Key layout:
 *   ["ws", wsId, "file:latest", path]                              -> StoredSnapshot
 *   ["ws", wsId, "file:versions", path]                            -> FileVersion[]
 *   ["ws", wsId, "file:content", path, version, "file:manifest"]   -> ContentManifest
 *   ["ws", wsId, "file:content", path, version, "file:chunk", i]   -> Uint8Array
 *   ["ws", wsId, "file:draft", path]                               -> { timestamp }
 *   ["ws", wsId, "marks", path, version]                           -> Mark[]
 */

import type { Key } from "#/persistence/mod.ts";

import type { ContentManifest } from "./chunked_content.ts";
import type { FileVersion } from "./types.ts";

/** The latest row: version metadata plus the content manifest, chunk 0 inline. */
export type StoredSnapshot = FileVersion & ContentManifest;

const WORKSPACES = "ws";
const FILE_LATEST = "file:latest";
const FILE_VERSIONS = "file:versions";
const FILE_CONTENT = "file:content";
const FILE_MANIFEST = "file:manifest";
const FILE_CHUNK = "file:chunk";
const FILE_DRAFT = "file:draft";
const MARKS = "marks";

/** Reserved version id for the mutable draft head. Not in the versions list. */
export const DRAFT_VERSION_ID = "draft";

export const latestKey = (wsId: string, path: string): Key => [WORKSPACES, wsId, FILE_LATEST, path];

/** The scan prefix for every file's latest row in one workspace. */
export const latestPrefixKey = (wsId: string): Key => [WORKSPACES, wsId, FILE_LATEST];

export const fileVersionsKey = (wsId: string, path: string): Key => [
  WORKSPACES,
  wsId,
  FILE_VERSIONS,
  path,
];

export const contentManifestKey = (wsId: string, path: string, versionId: string): Key => [
  WORKSPACES,
  wsId,
  FILE_CONTENT,
  path,
  versionId,
  FILE_MANIFEST,
];

export const contentChunkKey = (
  wsId: string,
  path: string,
  versionId: string,
  index: number,
): Key => [WORKSPACES, wsId, FILE_CONTENT, path, versionId, FILE_CHUNK, String(index)];

export const draftKey = (wsId: string, path: string): Key => [WORKSPACES, wsId, FILE_DRAFT, path];

export const marksKey = (wsId: string, path: string, versionId: string): Key => [
  WORKSPACES,
  wsId,
  MARKS,
  path,
  versionId,
];
