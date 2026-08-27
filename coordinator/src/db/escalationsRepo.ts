import { db } from './index.js';
import type { EscalationRow } from './types.js';

export function create(fields: { jobId?: number; trigger: string; detail?: string }): number {
  const result = db
    .prepare(`INSERT INTO escalations (job_id, trigger, detail) VALUES (?, ?, ?)`)
    .run(fields.jobId ?? null, fields.trigger, fields.detail ?? null);
  return result.lastInsertRowid as number;
}

export function listForJob(jobId: number): EscalationRow[] {
  return db.prepare(`SELECT * FROM escalations WHERE job_id = ? ORDER BY created_at`).all(jobId) as EscalationRow[];
}

export function listOpen(): EscalationRow[] {
  return db.prepare(`SELECT * FROM escalations WHERE status = 'open' ORDER BY created_at`).all() as EscalationRow[];
}

export function resolve(id: number): void {
  db.prepare(`UPDATE escalations SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`).run(id);
}
