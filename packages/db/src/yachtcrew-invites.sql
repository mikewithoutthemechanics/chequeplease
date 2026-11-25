CREATE TABLE IF NOT EXISTS crew_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    yacht_id TEXT REFERENCES yachts(id) ON DELETE SET NULL,
    contact TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invites_org ON crew_invites (org_id, status);
