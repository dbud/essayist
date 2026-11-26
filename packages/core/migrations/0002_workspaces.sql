CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  picture TEXT,
  role TEXT CHECK (role IN ('admin', 'writer')),
  createdAt INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES users (id),
  createdAt INTEGER NOT NULL,
  deletedAt INTEGER,
  deletedBy TEXT REFERENCES users (id)
);

-- for a future retention sweep, oldest first
CREATE INDEX workspaces_deleted ON workspaces (deletedAt) WHERE deletedAt IS NOT NULL;

CREATE TABLE workspace_members (
  wsId TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (wsId, userId)
) WITHOUT ROWID;

CREATE INDEX workspace_members_user ON workspace_members (userId);
