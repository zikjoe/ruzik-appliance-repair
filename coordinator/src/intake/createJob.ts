import * as customersRepo from '../db/customersRepo.js';
import * as jobsRepo from '../db/jobsRepo.js';
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
    customersRepo.update(customerId, {
      fullName: fields.fullName,
      address: fields.address,
      zip: fields.zip,
      email: fields.email,
    });
    logAction({ action: 'update_customer', recordType: 'customer', recordId: customerId, outcome: 'allowed' });
  } else {
    customerId = customersRepo.create({
      fullName: fields.fullName ?? 'Unknown',
      phone: fields.phone,
      email: fields.email,
      address: fields.address,
      zip: fields.zip,
      propertyType: fields.propertyType,
      accessInstructions: fields.accessInstructions,
      referralSource: fields.referralSource,
    });
    logAction({ action: 'create_customer', recordType: 'customer', recordId: customerId, outcome: 'allowed' });
  }

  const duplicate = findLikelyDuplicateJob(customerId, fields.appliance);

  const jobId = jobsRepo.create({
    customerId,
    channel,
    status: safety.hazard ? 'needs_human' : 'new_lead',
    address: fields.address,
    zip: fields.zip,
    serviceType: fields.serviceType,
    appliance: fields.appliance,
    brand: fields.brand,
    model: fields.model,
    problemDescription: fields.problemDescription ?? rawText,
    hasMedia: fields.hasMedia,
    preferredWindows: fields.preferredWindows,
    urgent: fields.urgent,
    needsHumanReview: safety.hazard || Boolean(duplicate),
    humanReviewReason: safety.hazard ? 'safety_hazard' : duplicate ? 'possible_duplicate' : undefined,
    duplicateOfJobId: duplicate?.id,
  });
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
