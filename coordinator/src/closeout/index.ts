import * as jobsRepo from '../db/jobsRepo.js';
import { logAction } from '../audit/index.js';

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
  const job = jobsRepo.getById(jobId);
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

/** Records the closeout checklist fields against a job. Nothing calls this
 * yet in production (there's no UI for a technician/owner to fill these in
 * — see GitHub issue #6, the admin dashboard), but it's the one place that
 * should ever write these columns once that exists, rather than another
 * raw UPDATE appearing wherever needs it next. */
export function recordCloseout(
  jobId: number,
  fields: Parameters<typeof jobsRepo.recordCloseoutFields>[1]
): void {
  jobsRepo.recordCloseoutFields(jobId, fields);
  logAction({ action: 'record_closeout_fields', recordType: 'job', recordId: jobId, outcome: 'allowed' });
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
  jobsRepo.updateStatus(jobId, 'closed');
  logAction({ action: 'close_job', recordType: 'job', recordId: jobId, outcome: 'allowed' });
  return check;
}
