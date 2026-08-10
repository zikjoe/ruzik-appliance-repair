import { db } from '../db/index.js';

export type Actor = 'ai_coordinator' | 'owner' | 'technician';
export type Outcome = 'allowed' | 'blocked' | 'escalated' | 'error';
export type RecordType = 'job' | 'customer' | 'message' | 'technician' | 'system';

/** Every state-changing action in the system must call this. See
 * job description § Technical and Ownership Requirements: "Every action must
 * create an audit log containing the time, action, record, and outcome." */
export function logAction(entry: {
  actor?: Actor;
  action: string;
  recordType: RecordType;
  recordId?: string | number;
  outcome: Outcome;
  detail?: string;
}): void {
  db.prepare(
    `INSERT INTO audit_log (actor, action, record_type, record_id, outcome, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    entry.actor ?? 'ai_coordinator',
    entry.action,
    entry.recordType,
    entry.recordId != null ? String(entry.recordId) : null,
    entry.outcome,
    entry.detail ?? null
  );
}

/** Manual pause switch. When paused, the coordinator may still read/qualify/draft
 * but must never send a message or confirm a schedule without a human first
 * flipping this back — see docs/runbook.md. */
export function isPaused(): boolean {
  const row = db.prepare(`SELECT value FROM system_state WHERE key = 'paused'`).get() as
    | { value: string }
    | undefined;
  return row?.value === 'true';
}

export function setPaused(paused: boolean, actor: Actor = 'owner'): void {
  db.prepare(`UPDATE system_state SET value = ? WHERE key = 'paused'`).run(paused ? 'true' : 'false');
  logAction({
    actor,
    action: paused ? 'pause_system' : 'resume_system',
    recordType: 'system',
    outcome: 'allowed',
  });
}

export interface ExportBundle {
  customers: unknown[];
  jobs: unknown[];
  technicians: unknown[];
  messages: unknown[];
  escalations: unknown[];
  auditLog: unknown[];
  exportedAt: string;
}

/** Full data export — every table, as plain JSON. Satisfies the
 * "administrator access and export capability" requirement without needing
 * any tooling beyond this endpoint. */
export function exportAll(): ExportBundle {
  const bundle: ExportBundle = {
    customers: db.prepare('SELECT * FROM customers').all(),
    jobs: db.prepare('SELECT * FROM jobs').all(),
    technicians: db.prepare('SELECT * FROM technicians').all(),
    messages: db.prepare('SELECT * FROM messages').all(),
    escalations: db.prepare('SELECT * FROM escalations').all(),
    auditLog: db.prepare('SELECT * FROM audit_log').all(),
    exportedAt: new Date().toISOString(),
  };
  logAction({ actor: 'owner', action: 'export_all_data', recordType: 'system', outcome: 'allowed' });
  return bundle;
}
