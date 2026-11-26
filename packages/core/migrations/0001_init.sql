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
