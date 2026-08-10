import { db } from '../db/index.js';
import { logAction } from '../audit/index.js';

interface JobCloseoutRow {
  id: number;
  diagnosis: string | null;
  work_performed: string | null;
  parts_used: string | null;
  invoice_amount_cents: number | null;
  payment_status: string | null;
  before_photo_ref: string | null;
  after_photo_ref: string | null;
  warranty_terms: string | null;
  warranty_expires: string | null;
  satisfaction_outcome: string | null;
  review_request_status: string | null;
  status: string;
}

export interface CloseoutCheck {
  complete: boolean;
  missing: string[];
}

/** job description § 6 Job Closeout — the exact checklist, checked before a
 * job can be marked closed. `photosRequired` defaults to true; pass false
 * only for jobs where before/after photos genuinely don't apply (documented
 * by whoever closes the job, not inferred silently by the AI). */
export function validateCloseout(jobId: number, opts: { photosRequired?: boolean } = {}): CloseoutCheck {
  const photosRequired = opts.photosRequired ?? true;
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as JobCloseoutRow | undefined;
  if (!job) throw new Error(`Job ${jobId} not found`);

  const missing: string[] = [];
  if (!job.diagnosis) missing.push('diagnosis');
  if (!job.work_performed) missing.push('work_performed');
  if (!job.parts_used) missing.push('parts_used');
  if (job.invoice_amount_cents == null) missing.push('invoice');
  if (!job.payment_status) missing.push('payment_status');
  if (photosRequired && !job.before_photo_ref) missing.push('before_photo');
  if (photosRequired && !job.after_photo_ref) missing.push('after_photo');
  if (!job.warranty_terms) missing.push('warranty_terms');
  if (!job.warranty_expires) missing.push('warranty_expiration');
  if (!job.satisfaction_outcome) missing.push('satisfaction_outcome');
  if (!job.review_request_status || job.review_request_status === 'not_sent') missing.push('review_request_status');

  return { complete: missing.length === 0, missing };
}

/** Refuses to close an incomplete job — the checklist is a hard gate, not a
 * warning. Missing fields get logged and left for the owner/technician to
 * fill in rather than closed with gaps. */
export function closeJob(jobId: number, opts: { photosRequired?: boolean } = {}): CloseoutCheck {
  const check = validateCloseout(jobId, opts);
  if (!check.complete) {
    logAction({
      action: 'close_job_blocked',
      recordType: 'job',
      recordId: jobId,
      outcome: 'blocked',
      detail: `missing: ${check.missing.join(',')}`,
    });
    return check;
  }
  db.prepare(`UPDATE jobs SET status = 'closed', updated_at = datetime('now') WHERE id = ?`).run(jobId);
  logAction({ action: 'close_job', recordType: 'job', recordId: jobId, outcome: 'allowed' });
  return check;
}
