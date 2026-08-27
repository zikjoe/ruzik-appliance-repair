import { db } from './index.js';
import type { JobRow } from './types.js';

export function getById(id: number): JobRow | undefined {
  return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
}

/** Same customer, same appliance, still open, opened in the last 30 days.
 * Used by intake to flag (not silently merge) a likely duplicate. */
export function findLikelyDuplicate(customerId: number, appliance: string | undefined): JobRow | undefined {
  return db
    .prepare(
      `SELECT * FROM jobs
       WHERE customer_id = ?
         AND appliance = ?
         AND status NOT IN ('completed', 'closed', 'cancelled')
         AND created_at > datetime('now', '-30 days')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(customerId, appliance ?? null) as JobRow | undefined;
}

export interface CreateJobFields {
  customerId: number;
  channel: string;
  status: string;
  address?: string;
  zip?: string;
  serviceType?: string;
  appliance?: string;
  brand?: string;
  model?: string;
  problemDescription: string;
  hasMedia?: boolean;
  preferredWindows?: string[];
  urgent?: boolean;
  needsHumanReview?: boolean;
  humanReviewReason?: string;
  duplicateOfJobId?: number;
}

export function create(fields: CreateJobFields): number {
  const result = db
    .prepare(
      `INSERT INTO jobs (
         customer_id, channel, status, address, zip, service_type, appliance, brand, model,
         problem_description, has_media, preferred_windows, urgent,
         needs_human_review, human_review_reason, duplicate_of_job_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.customerId,
      fields.channel,
      fields.status,
      fields.address ?? null,
      fields.zip ?? null,
      fields.serviceType ?? null,
      fields.appliance ?? null,
      fields.brand ?? null,
      fields.model ?? null,
      fields.problemDescription,
      fields.hasMedia ? 1 : 0,
      fields.preferredWindows ? JSON.stringify(fields.preferredWindows) : null,
      fields.urgent ? 1 : 0,
      fields.needsHumanReview ? 1 : 0,
      fields.humanReviewReason ?? null,
      fields.duplicateOfJobId ?? null
    );
  return result.lastInsertRowid as number;
}

/** Qualification only ever advances status out of 'new_lead' — it never
 * overwrites a status a later stage (scheduling, closeout) has already
 * moved past. */
export function updateQualification(
  id: number,
  fields: {
    inServiceArea: boolean;
    serviceSupported: boolean;
    needsHumanReview: boolean;
    humanReviewReason: string;
  }
): void {
  db.prepare(
    `UPDATE jobs SET
       in_service_area = ?,
       service_supported = ?,
       status = CASE WHEN status = 'new_lead' THEN 'qualifying' ELSE status END,
       needs_human_review = CASE WHEN ? THEN 1 ELSE needs_human_review END,
       human_review_reason = CASE WHEN ? THEN ? ELSE human_review_reason END,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    fields.inServiceArea ? 1 : 0,
    fields.serviceSupported ? 1 : 0,
    fields.needsHumanReview ? 1 : 0,
    fields.needsHumanReview ? 1 : 0,
    fields.humanReviewReason,
    id
  );
}

/** COALESCE, not overwrite: a caller (e.g. qualify) may already have set a
 * more specific reason before escalating — this only fills the reason in
 * if nothing more specific is there yet. */
export function markNeedsHumanReview(id: number, fallbackReason: string): void {
  db.prepare(
    `UPDATE jobs SET needs_human_review = 1, human_review_reason = COALESCE(human_review_reason, ?), status = 'needs_human', updated_at = datetime('now') WHERE id = ?`
  ).run(fallbackReason, id);
}

export function assignTechnician(id: number, technicianId: number): void {
  db.prepare(`UPDATE jobs SET technician_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    technicianId,
    id
  );
}

export function countOpenForTechnician(technicianId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM jobs WHERE technician_id = ? AND status NOT IN ('completed','closed','cancelled')`
      )
      .get(technicianId) as { n: number }
  ).n;
}

export function recordTechnicianResponse(
  id: number,
  opts: { accepted: boolean; scheduledWindow?: string }
): void {
  if (opts.accepted && opts.scheduledWindow) {
    db.prepare(
      `UPDATE jobs SET technician_accepted = 1, status = 'scheduled', scheduled_window = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(opts.scheduledWindow, id);
  } else {
    db.prepare(`UPDATE jobs SET technician_accepted = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  }
}

/** Generic status transition — used for cancellation confirmation and
 * closeout. Callers decide whether the transition is valid; this just
 * persists it. */
export function updateStatus(id: number, status: string): void {
  db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
}

export function recordCloseoutFields(
  id: number,
  fields: {
    diagnosis: string;
    workPerformed: string;
    partsUsed: string;
    invoiceAmountCents: number;
    paymentStatus: string;
    beforePhotoRef?: string;
    afterPhotoRef?: string;
    warrantyTerms: string;
    warrantyExpires: string;
    satisfactionOutcome: string;
    reviewRequestStatus: string;
  }
): void {
  db.prepare(
    `UPDATE jobs SET
       diagnosis = ?, work_performed = ?, parts_used = ?, invoice_amount_cents = ?,
       payment_status = ?, before_photo_ref = ?, after_photo_ref = ?,
       warranty_terms = ?, warranty_expires = ?, satisfaction_outcome = ?, review_request_status = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    fields.diagnosis,
    fields.workPerformed,
    fields.partsUsed,
    fields.invoiceAmountCents,
    fields.paymentStatus,
    fields.beforePhotoRef ?? null,
    fields.afterPhotoRef ?? null,
    fields.warrantyTerms,
    fields.warrantyExpires,
    fields.satisfactionOutcome,
    fields.reviewRequestStatus,
    id
  );
}
