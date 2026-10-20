-- 11. YachtCrew Pay tables (multicurrency crew payroll, Wise-ready)
-- Idempotent: safe to run on fresh and existing DBs.

CREATE TABLE IF NOT EXISTS yachts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    flag TEXT,
    home_port TEXT,
    owner_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_yachts_org ON yachts (org_id);

CREATE TABLE IF NOT EXISTS crew (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    yacht_id TEXT REFERENCES yachts(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    rank TEXT NOT NULL,
    nationality TEXT,
    home_currency TEXT NOT NULL,
    bank_country TEXT NOT NULL,
    iban_or_account TEXT NOT NULL,
    day_rate_minor INTEGER NOT NULL CHECK (day_rate_minor > 0),
    day_rate_currency TEXT NOT NULL DEFAULT 'EUR',
    phone TEXT,
    whatsapp_verified INTEGER NOT NULL DEFAULT 0,
    wise_recipient_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crew_org ON crew (org_id);
CREATE INDEX IF NOT EXISTS idx_crew_yacht ON crew (yacht_id);

CREATE TABLE IF NOT EXISTS pay_runs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    yacht_id TEXT REFERENCES yachts(id) ON DELETE SET NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    source_currency TEXT NOT NULL DEFAULT 'EUR',
    source_total_minor INTEGER NOT NULL DEFAULT 0,
    fx_locked_at TEXT,
    wise_quote_id TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_runs_org ON pay_runs (org_id, status);

CREATE TABLE IF NOT EXISTS pay_lines (
    id TEXT PRIMARY KEY,
    pay_run_id TEXT NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
    crew_id TEXT NOT NULL REFERENCES crew(id),
    days_worked TEXT NOT NULL DEFAULT '0',
    gross_minor INTEGER NOT NULL DEFAULT 0,
    fx_rate TEXT NOT NULL DEFAULT '1',
    dest_amount_minor INTEGER NOT NULL DEFAULT 0,
    dest_currency TEXT NOT NULL,
    payment_session_id TEXT REFERENCES payment_sessions(id) ON DELETE SET NULL,
    payslip_pdf_path TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_lines_run ON pay_lines (pay_run_id, status);
