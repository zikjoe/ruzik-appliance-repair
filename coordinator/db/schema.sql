-- Ruzik AI Dispatch Coordinator — SQLite schema
-- One file, trivially exportable/backupable. See docs/ownership-and-access.md.

CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  zip            TEXT,
  property_type  TEXT,
  access_notes   TEXT,
  referral_source TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS technicians (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT,
  skills      TEXT NOT NULL DEFAULT '[]',   -- JSON array of appliance types
  zones       TEXT NOT NULL DEFAULT '[]',   -- JSON array of ZIPs/areas covered
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  channel             TEXT NOT NULL,             -- website | sms | missed_call
  status              TEXT NOT NULL DEFAULT 'new_lead',
  -- new_lead -> qualifying -> needs_human -> scheduled -> in_progress
  -- -> awaiting_parts -> completed -> closed -> cancelled
  address             TEXT,                      -- service address for THIS job (customer may have several)
  zip                 TEXT,
  service_type        TEXT,                      -- Repair | Installation
  appliance            TEXT,
  brand                TEXT,
  model                TEXT,
  problem_description  TEXT,
  has_media            INTEGER NOT NULL DEFAULT 0,
  preferred_windows    TEXT,                      -- JSON array
  urgent               INTEGER NOT NULL DEFAULT 0,
  in_service_area      INTEGER,
  service_supported    INTEGER,
  technician_id        INTEGER REFERENCES technicians(id),
  technician_accepted  INTEGER,
  scheduled_window     TEXT,
  diagnosis            TEXT,
  work_performed        TEXT,
  parts_used            TEXT,
  invoice_amount_cents  INTEGER,
  payment_status         TEXT,                  -- unpaid | paid | outstanding
  before_photo_ref        TEXT,
  after_photo_ref          TEXT,
  warranty_terms             TEXT,
  warranty_expires           TEXT,
  satisfaction_outcome       TEXT,
  review_request_status      TEXT DEFAULT 'not_sent',
  needs_human_review    INTEGER NOT NULL DEFAULT 0,
  human_review_reason   TEXT,
  duplicate_of_job_id   INTEGER REFERENCES jobs(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       INTEGER REFERENCES jobs(id),
  customer_id  INTEGER REFERENCES customers(id),
  direction    TEXT NOT NULL,     -- inbound | outbound
  channel      TEXT NOT NULL,     -- website | sms | missed_call
  template_key TEXT,              -- which approved template, if any
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending_approval',
  -- pending_approval | approved | sent | rejected | blocked
  blocked_reason TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at  TEXT,
  sent_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

CREATE TABLE IF NOT EXISTS escalations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER REFERENCES jobs(id),
  trigger     TEXT NOT NULL,       -- matches authority-matrix.md trigger keys
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_job ON escalations(job_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  actor      TEXT NOT NULL DEFAULT 'ai_coordinator',  -- ai_coordinator | owner | technician
  action     TEXT NOT NULL,
  record_type TEXT NOT NULL,       -- job | customer | message | technician | system
  record_id   TEXT,
  outcome     TEXT NOT NULL,       -- allowed | blocked | escalated | error
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_type, record_id);

CREATE TABLE IF NOT EXISTS system_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed the pause switch to "running". Flip to "paused" to halt all AI-initiated
-- outbound actions instantly — see docs/runbook.md.
INSERT OR IGNORE INTO system_state (key, value) VALUES ('paused', 'false');
