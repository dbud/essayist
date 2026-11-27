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
  content TEXT NOT NULL CHECK (length(CAST(content AS BLOB)) <= 1000000),
  updatedAt TEXT NOT NULL CHECK (updatedAt IS strftime('%FT%R:%fZ', updatedAt))
) STRICT;

-- the review config: global, edited by admins, each item saved whole
CREATE TABLE model_pools (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  -- model ids in order
  models TEXT NOT NULL CHECK (json_valid(models) AND json_type(models) = 'array')
) STRICT;

CREATE TABLE prompts (
  key TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL
) STRICT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  color TEXT
) STRICT;

-- the units and variables are JSON, and the prompts, pools and categories they name are checked
-- when the pass is resolved
CREATE TABLE review_passes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  systemPromptKey TEXT NOT NULL,
  modelPoolId TEXT NOT NULL,
  units TEXT NOT NULL CHECK (json_valid(units) AND json_type(units) = 'array'),
  variables TEXT CHECK (json_valid(variables) AND json_type(variables) = 'object'),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
) STRICT;

-- at most one pass is active
CREATE UNIQUE INDEX review_passes_active ON review_passes (active) WHERE active = 1;

-- a review pass run over a version of a file; at most one runs on a file at a time
CREATE TABLE review_runs (
  id TEXT PRIMARY KEY NOT NULL,
  fileId TEXT NOT NULL,
  versionId TEXT NOT NULL,
  reviewPassId TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  startedAt TEXT NOT NULL CHECK (startedAt IS strftime('%FT%R:%fZ', startedAt)),
  completedAt TEXT CHECK (completedAt IS strftime('%FT%R:%fZ', completedAt)),
  error TEXT,
  summary TEXT,
  leaseOwner TEXT,
  heartbeatAt TEXT CHECK (heartbeatAt IS strftime('%FT%R:%fZ', heartbeatAt)),
  FOREIGN KEY (fileId, versionId) REFERENCES file_versions (fileId, id) ON DELETE CASCADE,
  CHECK ((status = 'running') = (completedAt IS NULL)),
  CHECK (error IS NULL OR status = 'failed'),
  CHECK (summary IS NULL OR status = 'completed'),
  CHECK (leaseOwner IS NULL OR status = 'running'),
  CHECK ((leaseOwner IS NULL) = (heartbeatAt IS NULL))
) STRICT;

CREATE UNIQUE INDEX review_runs_active ON review_runs (fileId) WHERE status = 'running';

CREATE INDEX review_runs_file ON review_runs (fileId, startedAt DESC);

-- for the stale-run janitor
CREATE INDEX review_runs_stale ON review_runs (heartbeatAt) WHERE status = 'running';

CREATE TABLE review_trace_events (
  runId TEXT NOT NULL REFERENCES review_runs (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  event TEXT NOT NULL CHECK (json_valid(event)),
  PRIMARY KEY (runId, seq)
) STRICT, WITHOUT ROWID;

-- a review comment, written once by its run and anchored to the version the run reviewed
CREATE TABLE marks (
  id TEXT PRIMARY KEY NOT NULL,
  runId TEXT NOT NULL REFERENCES review_runs (id) ON DELETE CASCADE,
  selectedText TEXT NOT NULL,
  beforeContext TEXT NOT NULL,
  afterContext TEXT NOT NULL,
  comment TEXT NOT NULL,
  -- NULL for an uncategorised mark
  categoryId TEXT REFERENCES categories (id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL CHECK (createdAt IS strftime('%FT%R:%fZ', createdAt)),
  offset INTEGER NOT NULL CHECK (offset >= 0),
  length INTEGER NOT NULL CHECK (length >= 0)
) STRICT;

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
