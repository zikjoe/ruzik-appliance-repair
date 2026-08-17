import { db } from '../db/index.js';
import { messageTemplates, business } from '../lib/config.js';
import { logAction } from '../audit/index.js';
import { checkAction } from '../guardrails/index.js';
import { fireAlert } from '../notify/index.js';

const BOT_QUESTION_PATTERNS = [
  /are you (a )?(bot|robot|ai|human|real person|person)/i,
  /am i talking to a (bot|robot|ai|person|human|real person)/i,
  /is this (a )?(bot|automated|ai)/i,
];

/** job description § 4: "The AI must not falsely represent itself as a human
 * if directly asked." This is checked ahead of normal template drafting so
 * it can never be prompted away — the disclosure text is hardcoded, not
 * model-generated. */
export function isAskingIfBot(text: string): boolean {
  return BOT_QUESTION_PATTERNS.some((re) => re.test(text));
}

export function disclosureMessage(): string {
  return `I'm an automated assistant for ${business.companyName}, here to help get your service request started. Happy to connect you with ${business.owner} directly any time — just ask.`;
}

function fillTemplate(templateKey: string, vars: Record<string, string>): string {
  const tmpl = messageTemplates.templates[templateKey];
  if (!tmpl) throw new Error(`Unknown template: ${templateKey}`);
  let body = tmpl.body;
  for (const key of tmpl.vars) {
    const value = vars[key] ?? `[[${key}]]`;
    body = body.replaceAll(`{{${key}}}`, value);
  }
  return body;
}

export interface DraftResult {
  messageId: number;
  body: string;
  status: 'pending_approval' | 'blocked';
}

/** Drafts the hardcoded disclosure response (job description § 4: must not
 * falsely represent itself as human if asked). Kept separate from
 * draftTemplateMessage because this body is fixed, never filled from
 * config/message-templates.json — there is nothing to vary. */
export function draftDisclosureMessage(opts: {
  jobId: number;
  customerId: number;
  channel: 'website' | 'sms' | 'missed_call';
}): DraftResult {
  const check = checkAction('send_approved_template', { jobId: opts.jobId });
  const body = disclosureMessage();
  const result = db
    .prepare(
      `INSERT INTO messages (job_id, customer_id, direction, channel, template_key, body, status, blocked_reason)
       VALUES (?, ?, 'outbound', ?, 'disclosure', ?, ?, ?)`
    )
    .run(opts.jobId, opts.customerId, opts.channel, body, check.allowed ? 'pending_approval' : 'blocked', check.allowed ? null : check.reason ?? null);
  const messageId = result.lastInsertRowid as number;
  logAction({
    action: 'draft_disclosure_message',
    recordType: 'message',
    recordId: messageId,
    outcome: check.allowed ? 'allowed' : 'blocked',
  });
  if (check.allowed) {
    fireAlert({
      urgency: 'approval',
      subject: `Disclosure message awaiting approval (job #${opts.jobId})`,
      body,
      jobId: opts.jobId,
    });
  }
  return { messageId, body, status: check.allowed ? 'pending_approval' : 'blocked' };
}

/** Drafts an approved-template message and queues it for owner approval
 * (copilot mode — see job description "The deal you should make with your
 * friend"). Never marks a message as sent; that only happens via
 * approveAndSend below, which is a separate, explicit human action. */
export function draftTemplateMessage(opts: {
  jobId: number;
  customerId: number;
  channel: 'website' | 'sms' | 'missed_call';
  templateKey: string;
  vars: Record<string, string>;
}): DraftResult {
  const check = checkAction('send_approved_template', { jobId: opts.jobId });
  const body = fillTemplate(opts.templateKey, opts.vars);

  const result = db
    .prepare(
      `INSERT INTO messages (job_id, customer_id, direction, channel, template_key, body, status, blocked_reason)
       VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?)`
    )
    .run(
      opts.jobId,
      opts.customerId,
      opts.channel,
      opts.templateKey,
      body,
      check.allowed ? 'pending_approval' : 'blocked',
      check.allowed ? null : check.reason ?? null
    );
  const messageId = result.lastInsertRowid as number;

  logAction({
    action: 'draft_template_message',
    recordType: 'message',
    recordId: messageId,
    outcome: check.allowed ? 'allowed' : 'blocked',
    detail: opts.templateKey,
  });

  if (check.allowed) {
    fireAlert({
      urgency: 'approval',
      subject: `Message awaiting approval — ${opts.templateKey} (job #${opts.jobId})`,
      body,
      jobId: opts.jobId,
    });
  }

  return { messageId, body, status: check.allowed ? 'pending_approval' : 'blocked' };
}

/** Records an inbound message from a customer or technician. Always allowed
 * — receiving/logging is never gated, only outbound sends are. */
export function recordInboundMessage(opts: {
  jobId?: number;
  customerId?: number;
  channel: 'website' | 'sms' | 'missed_call';
  body: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO messages (job_id, customer_id, direction, channel, body, status)
       VALUES (?, ?, 'inbound', ?, ?, 'sent')`
    )
    .run(opts.jobId ?? null, opts.customerId ?? null, opts.channel, opts.body);
  const id = result.lastInsertRowid as number;
  logAction({ action: 'record_inbound_message', recordType: 'message', recordId: id, outcome: 'allowed' });
  return id;
}

/** The explicit human action that turns a drafted message into a sent one.
 * In this pilot (no live Twilio account) "sending" means marking the record
 * sent — wiring an actual carrier is a go-live step, see
 * docs/go-live-checklist.md. Re-checks guardrails at send time in case the
 * system was paused after the draft was created. */
export function approveAndSend(messageId: number, actor: 'owner' = 'owner'): { sent: boolean; reason?: string } {
  const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId) as
    | { id: number; job_id: number | null; status: string }
    | undefined;
  if (!msg) throw new Error(`Message ${messageId} not found`);

  const check = checkAction('send_approved_template', { jobId: msg.job_id ?? undefined });
  if (!check.allowed) {
    db.prepare(`UPDATE messages SET status = 'blocked', blocked_reason = ? WHERE id = ?`).run(
      check.reason ?? 'blocked',
      messageId
    );
    logAction({ actor, action: 'send_blocked', recordType: 'message', recordId: messageId, outcome: 'blocked' });
    return { sent: false, reason: check.reason };
  }

  db.prepare(
    `UPDATE messages SET status = 'sent', approved_at = datetime('now'), sent_at = datetime('now') WHERE id = ?`
  ).run(messageId);
  logAction({ actor, action: 'send_message', recordType: 'message', recordId: messageId, outcome: 'allowed' });
  return { sent: true };
}

export function rejectMessage(messageId: number, reason: string, actor: 'owner' = 'owner'): void {
  db.prepare(`UPDATE messages SET status = 'rejected', blocked_reason = ? WHERE id = ?`).run(reason, messageId);
  logAction({ actor, action: 'reject_message', recordType: 'message', recordId: messageId, outcome: 'blocked', detail: reason });
}
