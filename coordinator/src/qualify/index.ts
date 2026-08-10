import { db } from '../db/index.js';
import { serviceArea, priceList } from '../lib/config.js';
import { logAction } from '../audit/index.js';
import { escalate } from '../guardrails/index.js';

export interface QualificationResult {
  inServiceArea: boolean | 'unknown';
  serviceSupported: boolean;
  needsHumanReview: boolean;
  reasons: string[];
}

/** job description § 2 Lead Qualification. Never auto-rejects an out-of-area
 * ZIP — the site's own copy says "not sure if you're in our area, call us",
 * so an unrecognized ZIP routes to human review rather than telling the
 * customer no (see config/service-area.json note). Never auto-promises a
 * repair is possible — that's enforced by qualification only gating
 * *scheduling*, never diagnosis language (see src/messaging). */
export function qualifyJob(jobId: number): QualificationResult {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
    | { zip: string | null; appliance: string | null }
    | undefined;
  if (!job) throw new Error(`Job ${jobId} not found`);

  const reasons: string[] = [];

  const inServiceArea: boolean | 'unknown' = job.zip
    ? serviceArea.zips.includes(job.zip)
    : 'unknown';
  if (inServiceArea === false) reasons.push('zip_outside_known_service_area');
  if (inServiceArea === 'unknown') reasons.push('zip_missing_or_unrecognized');

  const serviceSupported = job.appliance ? job.appliance in priceList.services : false;
  if (!serviceSupported) reasons.push('appliance_not_in_supported_list');

  const priceEntry = job.appliance ? priceList.services[job.appliance] : undefined;
  const hasPublishedRange = Boolean(priceEntry?.estimateLowCents && priceEntry?.estimateHighCents);
  if (serviceSupported && !hasPublishedRange) reasons.push('no_published_price_range_for_appliance');

  const needsHumanReview = inServiceArea !== true || !serviceSupported || !hasPublishedRange;

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
    inServiceArea === true ? 1 : 0,
    serviceSupported ? 1 : 0,
    needsHumanReview ? 1 : 0,
    needsHumanReview ? 1 : 0,
    reasons.join(','),
    jobId
  );

  logAction({
    action: 'qualify_job',
    recordType: 'job',
    recordId: jobId,
    outcome: needsHumanReview ? 'escalated' : 'allowed',
    detail: reasons.join(',') || 'qualified_clean',
  });

  if (needsHumanReview) {
    escalate({ jobId, trigger: 'ai_uncertain', detail: reasons.join(',') });
  }

  return { inServiceArea, serviceSupported, needsHumanReview, reasons };
}
