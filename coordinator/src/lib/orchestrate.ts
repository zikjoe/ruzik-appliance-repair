import { createJob } from '../intake/createJob.js';
import { parseWebsiteForm, type NetlifyFormPayload } from '../intake/parseWebsiteForm.js';
import { parseFreeText } from '../intake/parseFreeText.js';
import { qualifyJob } from '../qualify/index.js';
import { recommendTechnician } from '../scheduling/index.js';
import {
  draftTemplateMessage,
  draftDisclosureMessage,
  isAskingIfBot,
  recordInboundMessage,
} from '../messaging/index.js';
import { SAFETY_REDIRECT_MESSAGE, scanForSafetyHazard, classifyEscalationTriggers, escalate } from '../guardrails/index.js';
import { db } from '../db/index.js';
import { logAction } from '../audit/index.js';
import { missingRequiredFields } from './types.js';
import type { Channel, IntakeFields } from './types.js';

export interface InboundResult {
  jobId: number;
  customerId: number;
  safetyEscalated: boolean;
  needsHumanReview: boolean;
  outboundMessageId?: number;
  outboundBody?: string;
}

/** A safety-hazard redirect is sent immediately rather than queued for
 * approval — see job description § Authority ("handle emergencies... by
 * directing the customer to appropriate emergency services") and the
 * ownership requirement for mandatory, undelayed escalation. The text is
 * fixed and hardcoded (SAFETY_REDIRECT_MESSAGE), never model-generated, so
 * there is nothing for copilot-mode approval to protect against here — the
 * risk of a delay outweighs the risk of the fixed message itself. Everything
 * else in the system stays gated behind approval. */
function sendSafetyRedirectImmediately(jobId: number, customerId: number | undefined, channel: Channel): number {
  const result = db
    .prepare(
      `INSERT INTO messages (job_id, customer_id, direction, channel, template_key, body, status, approved_at, sent_at)
       VALUES (?, ?, 'outbound', ?, 'safety_redirect', ?, 'sent', datetime('now'), datetime('now'))`
    )
    .run(jobId, customerId ?? null, channel, SAFETY_REDIRECT_MESSAGE);
  const messageId = result.lastInsertRowid as number;
  logAction({ action: 'send_safety_redirect', recordType: 'message', recordId: messageId, outcome: 'allowed' });
  return messageId;
}

function firstName(fullName?: string): string {
  if (!fullName) return 'there';
  return fullName.trim().split(/\s+/)[0];
}

/** Shared tail end of both intake paths: qualify, recommend a technician if
 * qualified, and draft (or immediately send, for safety) the right first
 * message. */
function afterIntake(
  channel: Channel,
  jobId: number,
  customerId: number,
  rawText: string,
  safetyEscalated: boolean
): InboundResult {
  if (safetyEscalated) {
    const messageId = sendSafetyRedirectImmediately(jobId, customerId, channel);
    return { jobId, customerId, safetyEscalated: true, needsHumanReview: true, outboundMessageId: messageId };
  }

  const qualification = qualifyJob(jobId);
  if (qualification.inServiceArea === true && qualification.serviceSupported) {
    recommendTechnician(jobId);
  }

  const customer = db.prepare(`SELECT full_name FROM customers WHERE id = ?`).get(customerId) as
    | { full_name: string }
    | undefined;

  let outboundMessageId: number | undefined;
  let outboundBody: string | undefined;

  if (isAskingIfBot(rawText)) {
    // Disclosure is mandatory and non-negotiable, but still flows through the
    // same approval queue as any other outbound send — it's just guaranteed
    // truthful content, not a guarantee it ships instantly.
    const draft = draftDisclosureMessage({ jobId, customerId, channel });
    outboundMessageId = draft.messageId;
    outboundBody = draft.body;
  } else {
    const draft = draftTemplateMessage({
      jobId,
      customerId,
      channel,
      templateKey: 'initial_acknowledgment',
      vars: { customerFirstName: firstName(customer?.full_name) },
    });
    outboundMessageId = draft.messageId;
    outboundBody = draft.body;
  }

  return {
    jobId,
    customerId,
    safetyEscalated: false,
    needsHumanReview: qualification.needsHumanReview,
    outboundMessageId,
    outboundBody,
  };
}

/** Channel 1: Website inquiries (existing contact.html form via a Netlify
 * outgoing webhook — see docs/go-live-checklist.md for the dashboard config
 * step). Fully deterministic field mapping, no LLM call needed. */
export function handleWebsiteInquiry(payload: NetlifyFormPayload): InboundResult {
  const fields = parseWebsiteForm(payload);
  const rawText = fields.problemDescription ?? JSON.stringify(payload.data);
  const created = createJob({ channel: 'website', rawText, fields });
  return afterIntake('website', created.jobId, created.customerId, rawText, created.safetyEscalated);
}

/** Channels 2 & 3: SMS conversations and missed-call text-back. Free text,
 * so field extraction goes through Claude — but the safety scan inside
 * createJob() runs on the raw text BEFORE that extraction call, so a hazard
 * is caught even if the model call fails or is skipped. */
export async function handleFreeTextInquiry(opts: {
  channel: 'sms' | 'missed_call';
  phone: string;
  text: string;
}): Promise<InboundResult> {
  let fields: IntakeFields = { phone: opts.phone };
  try {
    const extracted = await parseFreeText(opts.text);
    fields = { ...extracted, phone: opts.phone };
  } catch {
    // Extraction unavailable (e.g. no ANTHROPIC_API_KEY in this pilot sandbox,
    // or spending cap hit) — fall back to phone-only fields. The missing-field
    // flow below will ask the customer directly for what's needed.
  }
  const created = createJob({ channel: opts.channel, rawText: opts.text, fields });
  const missing = missingRequiredFields(fields);
  if (missing.length > 0 && !created.safetyEscalated) {
    logAction({
      action: 'missing_required_fields',
      recordType: 'job',
      recordId: created.jobId,
      outcome: 'allowed',
      detail: missing.join(','),
    });
  }
  return afterIntake(opts.channel, created.jobId, created.customerId, opts.text, created.safetyEscalated);
}

export interface FollowUpResult {
  messageId: number;
  safetyEscalated: boolean;
  triggers: string[];
}

/** A reply on an ALREADY-open job (reschedule request, cancellation, "still
 * broken", "technician never showed", an angry follow-up, an injection
 * attempt buried in message 3 of a thread, etc.). Runs the exact same
 * safety-scan-first / classifier pipeline as a brand-new inquiry — a hazard
 * or an escalation trigger doesn't stop mattering just because the job
 * already exists. This does NOT create a new job or customer record. */
export function handleFollowUpMessage(opts: {
  jobId: number;
  customerId?: number;
  channel: Channel;
  body: string;
}): FollowUpResult {
  const messageId = recordInboundMessage(opts);

  const safety = scanForSafetyHazard(opts.body);
  if (safety.hazard) {
    escalate({ jobId: opts.jobId, trigger: 'safety_hazard', detail: safety.category });
    sendSafetyRedirectImmediately(opts.jobId, opts.customerId, opts.channel);
    return { messageId, safetyEscalated: true, triggers: ['safety_hazard'] };
  }

  const triggers = classifyEscalationTriggers(opts.body);
  for (const trigger of triggers) {
    escalate({ jobId: opts.jobId, trigger });
  }

  if (isAskingIfBot(opts.body) && opts.customerId != null) {
    draftDisclosureMessage({ jobId: opts.jobId, customerId: opts.customerId, channel: opts.channel });
  }

  return { messageId, safetyEscalated: false, triggers };
}
