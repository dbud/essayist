CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'writer' CHECK (role IN ('admin', 'writer')),
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt))
) STRICT;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES users (id),
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  deletedAt TEXT CHECK (deletedAt IS strftime('%FT%R:%fZ', deletedAt)),
  deletedBy TEXT REFERENCES users (id),
  CHECK ((deletedAt IS NULL) = (deletedBy IS NULL))
) STRICT;

-- for a future retention sweep, oldest first; ISO timestamps sort as text
CREATE INDEX workspaces_deleted ON workspaces (deletedAt) WHERE deletedAt IS NOT NULL;

CREATE TABLE workspace_members (
  wsId TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  PRIMARY KEY (wsId, userId)
) STRICT, WITHOUT ROWID;

CREATE INDEX workspace_members_user ON workspace_members (userId);

CREATE TABLE files (
  id TEXT PRIMARY KEY NOT NULL,
  wsId TEXT NOT NULL REFERENCES workspaces (id),
  path TEXT NOT NULL CHECK (path <> ''),
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  deletedAt TEXT CHECK (deletedAt IS strftime('%FT%R:%fZ', deletedAt)),
  deletedBy TEXT REFERENCES users (id),
  CHECK ((deletedAt IS NULL) = (deletedBy IS NULL))
) STRICT;

-- a path is taken only by a file that is not deleted
CREATE UNIQUE INDEX files_path ON files (wsId, path) WHERE deletedAt IS NULL;

CREATE TABLE file_versions (
  id TEXT PRIMARY KEY NOT NULL,
  fileId TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  -- 1, 2, 3... per file; the highest is the latest
  seq INTEGER NOT NULL CHECK (seq > 0),
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  -- the 1 MB document cap
  content TEXT NOT NULL CHECK (length(CAST(content AS BLOB)) <= 1000000),
  UNIQUE (fileId, seq),
  UNIQUE (fileId, id)
) STRICT;

CREATE TABLE file_drafts (
  fileId TEXT PRIMARY KEY NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  -- the version the draft was written on; once it is not the latest, the draft is stale
  baseVersionId TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(CAST(content AS BLOB)) <= 1000000),
  updatedAt TEXT NOT NULL CHECK (updatedAt IS strftime('%FT%R:%fZ', updatedAt)),
  FOREIGN KEY (fileId, baseVersionId) REFERENCES file_versions (fileId, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE marks (
  id TEXT PRIMARY KEY NOT NULL,
  versionId TEXT NOT NULL REFERENCES file_versions (id) ON DELETE CASCADE,
  -- the review run and unit that placed the mark
  runId TEXT NOT NULL REFERENCES review_runs (id) ON DELETE CASCADE,
  unitId TEXT NOT NULL,
  -- the same for every copy of a mark in later versions
  threadId TEXT NOT NULL,
  selectedText TEXT NOT NULL,
  beforeContext TEXT NOT NULL,
  afterContext TEXT NOT NULL,
  comment TEXT NOT NULL,
  -- NULL for an uncategorised mark
  categoryId TEXT,
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  offset INTEGER NOT NULL CHECK (offset >= 0),
  length INTEGER NOT NULL CHECK (length >= 0),
  status TEXT NOT NULL CHECK (status IN ('resolved', 'stale'))
) STRICT;

CREATE INDEX marks_version ON marks (versionId);

-- for the cascade from review_runs
CREATE INDEX marks_run ON marks (runId);

CREATE TABLE kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE auth_session (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL CHECK (expiresAt IS strftime('%FT%R:%fZ', expiresAt)),
  tokens TEXT CHECK (json_valid(tokens))
) STRICT;

-- for a future expiry sweep
CREATE INDEX auth_session_expiry ON auth_session (expiresAt);

-- for the cascade from users
CREATE INDEX auth_session_user ON auth_session (userId);

CREATE TABLE auth_refresh_token (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refreshToken TEXT NOT NULL,
  updatedAt TEXT NOT NULL CHECK (updatedAt IS strftime('%FT%R:%fZ', updatedAt))
) STRICT;

CREATE TABLE review_runs (
  id TEXT NOT NULL,
  wsId TEXT NOT NULL,
  path TEXT NOT NULL,
  reviewPassId TEXT NOT NULL,
  versionId TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  error TEXT,
  summary TEXT,
  leaseOwner TEXT,
  heartbeatAt INTEGER,
  PRIMARY KEY (wsId, id)
) STRICT, WITHOUT ROWID;

CREATE INDEX review_runs_started ON review_runs (wsId, startedAt DESC);

-- the key marks.runId references
CREATE UNIQUE INDEX review_runs_id ON review_runs (id);

-- a global sweep for runs in progress, for the stale-run janitor
CREATE INDEX review_runs_stale ON review_runs (heartbeatAt) WHERE status = 'running';

-- a single running review per file
CREATE UNIQUE INDEX review_runs_active ON review_runs (wsId, path) WHERE status = 'running';

CREATE TABLE review_trace_events (
  wsId TEXT NOT NULL,
  runId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event TEXT NOT NULL,
  PRIMARY KEY (wsId, runId, seq)
) STRICT, WITHOUT ROWID;
