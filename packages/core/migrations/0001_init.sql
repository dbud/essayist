CREATE TABLE kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE auth_session (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  tokens TEXT
);

-- for a future expiry sweep
CREATE INDEX auth_session_expiry ON auth_session (expiresAt);

CREATE TABLE auth_refresh_token (
  userId TEXT PRIMARY KEY NOT NULL,
  refreshToken TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

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
) WITHOUT ROWID;

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
) WITHOUT ROWID;
