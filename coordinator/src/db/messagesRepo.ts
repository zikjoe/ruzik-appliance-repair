import { db } from './index.js';
import type { MessageRow } from './types.js';

export function getById(id: number): MessageRow | undefined {
  return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MessageRow | undefined;
}

/** The one and only place anything gets written into `messages`. Both a
 * drafted, approval-gated message (src/messaging) and an immediately-sent
 * safety redirect (src/lib/orchestrate) go through this — previously they
 * had two separate raw INSERTs, which is exactly the kind of drift a
 * shared table with no repository invites. */
export function insert(fields: {
  jobId: number | null;
  customerId: number | null;
  direction: 'inbound' | 'outbound';
  channel: string;
  templateKey?: string;
  body: string;
  status: string;
  blockedReason?: string;
  /** True for the fixed safety redirect, which sends immediately rather
   * than waiting in the approval queue — sets approved_at/sent_at at
   * insert time via SQL's own datetime('now'), same clock every other
   * timestamp column in this table uses. */
  sentImmediately?: boolean;
}): number {
  const timestampExpr = fields.sentImmediately ? `datetime('now')` : 'NULL';
  const result = db
    .prepare(
      `INSERT INTO messages (job_id, customer_id, direction, channel, template_key, body, status, blocked_reason, approved_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${timestampExpr}, ${timestampExpr})`
    )
    .run(
      fields.jobId,
      fields.customerId,
      fields.direction,
      fields.channel,
      fields.templateKey ?? null,
      fields.body,
      fields.status,
      fields.blockedReason ?? null
    );
  return result.lastInsertRowid as number;
}

export function updateStatus(id: number, status: string, opts: { blockedReason?: string } = {}): void {
  db.prepare(`UPDATE messages SET status = ?, blocked_reason = ? WHERE id = ?`).run(
    status,
    opts.blockedReason ?? null,
    id
  );
}

export function markSent(id: number): void {
  db.prepare(
    `UPDATE messages SET status = 'sent', approved_at = datetime('now'), sent_at = datetime('now') WHERE id = ?`
  ).run(id);
}

export function listPendingApproval(): MessageRow[] {
  return db.prepare(`SELECT * FROM messages WHERE status = 'pending_approval' ORDER BY created_at`).all() as MessageRow[];
}

export function listForJob(jobId: number): MessageRow[] {
  return db.prepare(`SELECT * FROM messages WHERE job_id = ? ORDER BY created_at`).all(jobId) as MessageRow[];
}
