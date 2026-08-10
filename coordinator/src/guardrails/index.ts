import { escalationTriggers } from '../lib/config.js';
import { db } from '../db/index.js';
import { logAction, isPaused, type Actor } from '../audit/index.js';

export type EscalationKey = (typeof escalationTriggers.escalationTriggers)[number]['key'] | 'safety_hazard';

/** Scans free text for the safety keywords from config/escalation-triggers.json.
 * Runs BEFORE any AI-drafted reply is generated for a given inbound message —
 * a hit here must short-circuit straight to escalation with a canned safety
 * redirect, never an AI-composed response. See job description
 * § Mandatory Human Escalation and § Authority ("handle emergencies beyond
 * directing the customer to appropriate emergency services"). */
export function scanForSafetyHazard(text: string): { hazard: boolean; category?: string } {
  const lower = text.toLowerCase();
  for (const [category, phrases] of Object.entries(escalationTriggers.safetyKeywords)) {
    if (!Array.isArray(phrases)) continue; // ignore any non-keyword-list metadata in the config file
    if (phrases.some((p) => lower.includes(p.toLowerCase()))) {
      return { hazard: true, category };
    }
  }
  return { hazard: false };
}

export const SAFETY_REDIRECT_MESSAGE =
  "This sounds like it could be a safety emergency. Please exit the area if needed and call 911 or your gas/electric utility's emergency line right away. We've flagged this for our owner to follow up on the repair once you're safe — this is not a message you need to reply to for that to happen.";

/** The Authority allow-list from the job description, as machine-checkable
 * action kinds. Anything not in this set can never be auto-executed — it can
 * only be queued to `approvals`/escalations for a human. */
export const ALLOWED_ACTION_KINDS = new Set([
  'answer_approved_faq',
  'collect_customer_info',
  'create_job_record',
  'update_job_record',
  'send_approved_template',
  'offer_approved_window',
  'send_reminder',
  'send_followup',
  'recommend_technician_assignment',
]);

/** Actions the AI must never take autonomously, per job description § Authority
 * "The AI may not independently...". Present for documentation + tests; the
 * real enforcement is that nothing outside ALLOWED_ACTION_KINDS can be sent. */
export const FORBIDDEN_ACTION_KINDS = new Set([
  'diagnose_appliance',
  'guarantee_repair_outcome',
  'create_unapproved_price_or_discount',
  'approve_refund_or_credit',
  'make_payment',
  'purchase_parts',
  'change_contractor_compensation',
  'settle_dispute',
  'admit_legal_liability',
  'threaten_collections',
  'handle_emergency_directly',
  'delete_customer_or_financial_record',
  'send_mass_marketing',
  'publish_social_media',
  'confirm_exception_without_approval',
]);

export interface GuardrailCheck {
  allowed: boolean;
  escalate?: EscalationKey;
  reason?: string;
}

/** Central gate: call this before executing ANY action kind. Blocks anything
 * not on the allow-list, and blocks everything (even allowed kinds) while the
 * system is paused, except read-only info collection. */
export function checkAction(actionKind: string, opts: { jobId?: number } = {}): GuardrailCheck {
  if (FORBIDDEN_ACTION_KINDS.has(actionKind)) {
    logAction({
      action: `blocked:${actionKind}`,
      recordType: 'job',
      recordId: opts.jobId,
      outcome: 'blocked',
      detail: 'Action kind is on the forbidden list (job description § Authority).',
    });
    return { allowed: false, reason: 'forbidden_action_kind' };
  }
  if (!ALLOWED_ACTION_KINDS.has(actionKind)) {
    logAction({
      action: `blocked:${actionKind}`,
      recordType: 'job',
      recordId: opts.jobId,
      outcome: 'blocked',
      detail: 'Action kind is not on the allow-list.',
    });
    return { allowed: false, reason: 'not_on_allow_list' };
  }
  if (isPaused() && actionKind !== 'collect_customer_info') {
    logAction({
      action: `blocked:${actionKind}`,
      recordType: 'job',
      recordId: opts.jobId,
      outcome: 'blocked',
      detail: 'System is paused.',
    });
    return { allowed: false, reason: 'system_paused' };
  }
  return { allowed: true };
}

/** Raise a human escalation and log it. Escalations are never silent — every
 * one lands in the `escalations` table (surfaced in the daily report / owner
 * queue) and the audit log. */
export function escalate(opts: {
  jobId?: number;
  trigger: EscalationKey;
  detail?: string;
  actor?: Actor;
}): number {
  const result = db
    .prepare(`INSERT INTO escalations (job_id, trigger, detail) VALUES (?, ?, ?)`)
    .run(opts.jobId ?? null, opts.trigger, opts.detail ?? null);
  if (opts.jobId) {
    db.prepare(
      // COALESCE, not overwrite: a caller (e.g. qualifyJob) may already have
      // set a more specific reason before raising this escalation — don't
      // clobber it with just the trigger key.
      `UPDATE jobs SET needs_human_review = 1, human_review_reason = COALESCE(human_review_reason, ?), status = 'needs_human', updated_at = datetime('now') WHERE id = ?`
    ).run(opts.trigger, opts.jobId);
  }
  logAction({
    actor: opts.actor ?? 'ai_coordinator',
    action: 'escalate',
    recordType: 'job',
    recordId: opts.jobId,
    outcome: 'escalated',
    detail: `${opts.trigger}${opts.detail ? `: ${opts.detail}` : ''}`,
  });
  return result.lastInsertRowid as number;
}

const ANGER_PATTERNS = [
  /\brefund\b/i,
  /\b(furious|pissed|angry|ripped off|scam|sue|lawyer|lawsuit)\b/i,
  /\bunacceptable\b/i,
  /!{2,}/,
];

const DISPUTE_PATTERNS = [/\bdispute\b/i, /\bovercharg/i, /\bnever authorized\b/i, /\bwrong (amount|charge)\b/i];

const LEGAL_PATTERNS = [/\b(insurance claim|lawsuit|attorney|lawyer|licens(e|ing)|tax (id|form)|employment)\b/i];

const INJECTION_PATTERNS = [
  /ignore\b.{0,30}\binstructions/i,
  /you are now/i,
  /system prompt/i,
  /act as (the owner|isaac|admin)/i,
  /disregard (your|the) (rules|guardrails|instructions)/i,
];

const CANCELLATION_PATTERNS = [/\bcancel\b/i, /\bdon'?t need (it|the appointment|service) anymore\b/i];

const LATE_ARRIVAL_PATTERNS = [
  /running late/i,
  /hasn'?t (shown up|arrived)/i,
  /\bno[- ]show\b/i,
  /where is (the|my) technician/i,
];

const WARRANTY_CALLBACK_PATTERNS = [
  /\b(still|same) (broken|problem|issue)\b/i,
  /\bunder warranty\b/i,
  /broke again/i,
  /stopped working again/i,
];

/** Lightweight keyword/pattern classifier for the non-safety escalation
 * triggers. This intentionally does NOT call the LLM — cheap, deterministic,
 * and can't itself be prompt-injected. The LLM is only used for drafting once
 * a message has already cleared this gate. */
export function classifyEscalationTriggers(text: string): EscalationKey[] {
  const hits: EscalationKey[] = [];
  if (ANGER_PATTERNS.some((re) => re.test(text))) hits.push('angry_or_threatening');
  if (DISPUTE_PATTERNS.some((re) => re.test(text))) hits.push('charge_dispute');
  if (LEGAL_PATTERNS.some((re) => re.test(text))) hits.push('legal_insurance_employment_tax_licensing');
  if (INJECTION_PATTERNS.some((re) => re.test(text))) hits.push('prompt_injection_suspected');
  if (CANCELLATION_PATTERNS.some((re) => re.test(text))) hits.push('cancellation');
  if (LATE_ARRIVAL_PATTERNS.some((re) => re.test(text))) hits.push('late_arrival');
  if (WARRANTY_CALLBACK_PATTERNS.some((re) => re.test(text))) hits.push('warranty_callback');
  return hits;
}
