import { describe, it, expect, afterEach } from 'vitest';
import { checkAction, FORBIDDEN_ACTION_KINDS, ALLOWED_ACTION_KINDS } from '../../src/guardrails/index.js';
import { setPaused, isPaused } from '../../src/audit/index.js';
import { handleWebsiteInquiry } from '../../src/lib/orchestrate.js';
import { draftTemplateMessage, approveAndSend, rejectMessage } from '../../src/messaging/index.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload } from './helpers.js';

afterEach(() => {
  // Several tests below pause the system — make sure later tests in this
  // file don't inherit a paused state.
  if (isPaused()) setPaused(false);
});

describe('Authority allow-list', () => {
  it('every action the job description forbids the AI from taking is structurally blocked', () => {
    const forbidden = [
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
    ];
    for (const kind of forbidden) {
      expect(FORBIDDEN_ACTION_KINDS.has(kind)).toBe(true);
      expect(checkAction(kind).allowed).toBe(false);
    }
  });

  it('every action the job description allows the AI to take is on the allow-list', () => {
    const allowed = [
      'answer_approved_faq',
      'collect_customer_info',
      'create_job_record',
      'update_job_record',
      'send_approved_template',
      'offer_approved_window',
      'send_reminder',
      'send_followup',
      'recommend_technician_assignment',
    ];
    for (const kind of allowed) {
      expect(ALLOWED_ACTION_KINDS.has(kind)).toBe(true);
      expect(checkAction(kind).allowed).toBe(true);
    }
  });

  it('an unrecognized action kind is blocked by default (deny by default, not allow by default)', () => {
    expect(checkAction('some_made_up_action_nobody_defined').allowed).toBe(false);
  });
});

describe('Manual pause switch', () => {
  it('defaults to running, and blocks outbound sends the instant it is paused', () => {
    expect(isPaused()).toBe(false);
    setPaused(true);
    expect(isPaused()).toBe(true);
    expect(checkAction('send_approved_template').allowed).toBe(false);
    setPaused(false);
    expect(checkAction('send_approved_template').allowed).toBe(true);
  });

  it('still allows read-only info collection while paused', () => {
    setPaused(true);
    expect(checkAction('collect_customer_info').allowed).toBe(true);
  });

  it('a paused system blocks a real draft-to-send flow end to end', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    setPaused(true);
    const draft = draftTemplateMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      templateKey: 'appointment_reminder',
      vars: { customerFirstName: 'Jane', window: 'Monday morning' },
    });
    expect(draft.status).toBe('blocked');
  });
});

describe('Copilot mode — nothing sends without an explicit approval step', () => {
  it('a drafted template message is queued pending_approval, never sent automatically', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const draft = draftTemplateMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      templateKey: 'appointment_confirmation',
      vars: { customerFirstName: 'Jane', window: 'Tuesday afternoon', technicianName: 'Isaac' },
    });
    const row = db.prepare('SELECT status FROM messages WHERE id = ?').get(draft.messageId) as { status: string };
    expect(row.status).toBe('pending_approval');
  });

  it('approveAndSend flips a pending message to sent', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const draft = draftTemplateMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      templateKey: 'appointment_reminder',
      vars: { customerFirstName: 'Jane', window: 'Wednesday morning' },
    });
    const result = approveAndSend(draft.messageId);
    expect(result.sent).toBe(true);
    const row = db.prepare('SELECT status FROM messages WHERE id = ?').get(draft.messageId) as { status: string };
    expect(row.status).toBe('sent');
  });

  it('rejectMessage marks a draft rejected instead of sending it', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const draft = draftTemplateMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      templateKey: 'review_request',
      vars: { customerFirstName: 'Jane', reviewLink: 'https://example.com/review' },
    });
    rejectMessage(draft.messageId, 'not ready to ask for a review yet');
    const row = db.prepare('SELECT status FROM messages WHERE id = ?').get(draft.messageId) as { status: string };
    expect(row.status).toBe('rejected');
  });
});
