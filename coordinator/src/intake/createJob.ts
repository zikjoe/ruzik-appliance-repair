import { db } from '../db/index.js';
import { logAction } from '../audit/index.js';
import { scanForSafetyHazard, classifyEscalationTriggers, escalate } from '../guardrails/index.js';
import { findExistingCustomer, findLikelyDuplicateJob } from './dedupe.js';
import type { Channel, IntakeFields } from '../lib/types.js';

export interface CreateJobResult {
  jobId: number;
  customerId: number;
  safetyEscalated: boolean;
  duplicateFlagged: boolean;
  otherEscalations: string[];
}

/** Entry point for every inbound inquiry, regardless of channel. Order of
 * operations matters and mirrors the job description:
 *   1. Safety scan FIRST, on the raw text, before anything else touches it.
 *   2. Dedup against existing customers (§1: "prevent duplicate entries").
 *   3. Create/update the customer + job records.
 *   4. Non-safety escalation classification (anger, disputes, legal, etc.)
 *   5. Audit log every step. */
export function createJob(opts: {
  channel: Channel;
  rawText: string;
  fields: IntakeFields;
}): CreateJobResult {
  const { channel, rawText, fields } = opts;

  const safety = scanForSafetyHazard(rawText);

  const existing = findExistingCustomer({ phone: fields.phone, email: fields.email });
  let customerId: number;
  if (existing) {
    customerId = existing.id;
    db.prepare(
      `UPDATE customers SET
         full_name = COALESCE(?, full_name),
         address = COALESCE(?, address),
         zip = COALESCE(?, zip),
         email = COALESCE(?, email),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(fields.fullName ?? null, fields.address ?? null, fields.zip ?? null, fields.email ?? null, customerId);
    logAction({ action: 'update_customer', recordType: 'customer', recordId: customerId, outcome: 'allowed' });
  } else {
    const result = db
      .prepare(
        `INSERT INTO customers (full_name, phone, email, address, zip, property_type, access_notes, referral_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fields.fullName ?? 'Unknown',
        fields.phone ?? null,
        fields.email ?? null,
        fields.address ?? null,
        fields.zip ?? null,
        fields.propertyType ?? null,
        fields.accessInstructions ?? null,
        fields.referralSource ?? null
      );
    customerId = result.lastInsertRowid as number;
    logAction({ action: 'create_customer', recordType: 'customer', recordId: customerId, outcome: 'allowed' });
  }

  const duplicate = findLikelyDuplicateJob(customerId, fields.appliance) as { id: number } | undefined;

  const jobResult = db
    .prepare(
      `INSERT INTO jobs (
         customer_id, channel, status, address, zip, service_type, appliance, brand, model,
         problem_description, has_media, preferred_windows, urgent,
         needs_human_review, human_review_reason, duplicate_of_job_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customerId,
      channel,
      safety.hazard ? 'needs_human' : 'new_lead',
      fields.address ?? null,
      fields.zip ?? null,
      fields.serviceType ?? null,
      fields.appliance ?? null,
      fields.brand ?? null,
      fields.model ?? null,
      fields.problemDescription ?? rawText,
      fields.hasMedia ? 1 : 0,
      fields.preferredWindows ? JSON.stringify(fields.preferredWindows) : null,
      fields.urgent ? 1 : 0,
      safety.hazard || duplicate ? 1 : 0,
      safety.hazard ? 'safety_hazard' : duplicate ? 'possible_duplicate' : null,
      duplicate?.id ?? null
    );
  const jobId = jobResult.lastInsertRowid as number;
  logAction({ action: 'create_job_record', recordType: 'job', recordId: jobId, outcome: 'allowed' });

  const otherEscalations: string[] = [];

  if (safety.hazard) {
    escalate({ jobId, trigger: 'safety_hazard', detail: safety.category });
  }
  if (duplicate) {
    escalate({ jobId, trigger: 'ai_uncertain', detail: `possible duplicate of job #${duplicate.id}` });
    otherEscalations.push('possible_duplicate');
  }
  for (const trigger of classifyEscalationTriggers(rawText)) {
    escalate({ jobId, trigger });
    otherEscalations.push(trigger);
  }

  return {
    jobId,
    customerId,
    safetyEscalated: safety.hazard,
    duplicateFlagged: Boolean(duplicate),
    otherEscalations,
  };
}
