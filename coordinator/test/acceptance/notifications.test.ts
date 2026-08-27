import { describe, it, expect } from 'vitest';
import { sendAlert } from '../../src/notify/index.js';
import { handleWebsiteInquiry } from '../../src/lib/orchestrate.js';
import { escalate } from '../../src/guardrails/index.js';
import { draftTemplateMessage } from '../../src/messaging/index.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload } from './helpers.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Owner alerts', () => {
  it('sendAlert logs a skipped outcome for both channels when no credentials are configured (the pilot-sandbox default)', async () => {
    expect(process.env.SMTP_HOST).toBeUndefined();
    expect(process.env.TWILIO_ACCOUNT_SID).toBeUndefined();

    await sendAlert({ urgency: 'escalation', subject: 'test escalation', body: 'test body' });

    const rows = db
      .prepare(`SELECT action FROM audit_log WHERE action IN ('alert_email_skipped', 'alert_sms_skipped') ORDER BY id DESC LIMIT 2`)
      .all() as { action: string }[];
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('alert_email_skipped');
    expect(actions).toContain('alert_sms_skipped');
  });

  it('never throws and never blocks the caller, even with bad/partial env vars', async () => {
    process.env.SMTP_HOST = 'smtp.invalid.example';
    process.env.SMTP_USER = 'nobody@example.com';
    process.env.SMTP_PASS = 'wrong';
    try {
      await expect(sendAlert({ urgency: 'approval', subject: 'x', body: 'y' })).resolves.toBeUndefined();
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    }
  });

  it('a real escalation triggers an alert-dispatch attempt (fire-and-forget)', async () => {
    // handleWebsiteInquiry's own initial-acknowledgment draft already fires an
    // alert — checkpoint after it so this test proves escalate() itself
    // fires a NEW one, not just that the job has some alert row from setup.
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    await flush();
    const checkpoint = (db.prepare(`SELECT MAX(id) as maxId FROM audit_log`).get() as { maxId: number }).maxId ?? 0;

    escalate({ jobId: initial.jobId, trigger: 'ai_uncertain', detail: 'test' });
    await flush();

    const rows = db
      .prepare(`SELECT action FROM audit_log WHERE id > ? AND action LIKE 'alert_%'`)
      .all(checkpoint) as { action: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a drafted message pending approval triggers an alert-dispatch attempt', async () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    await flush();
    const checkpoint = (db.prepare(`SELECT MAX(id) as maxId FROM audit_log`).get() as { maxId: number }).maxId ?? 0;

    draftTemplateMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      templateKey: 'appointment_reminder',
      vars: { customerFirstName: 'Jane', window: 'Monday morning' },
    });
    await flush();

    const rows = db
      .prepare(`SELECT action FROM audit_log WHERE id > ? AND action LIKE 'alert_%'`)
      .all(checkpoint) as { action: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a blocked draft (e.g. while paused) does NOT fire an alert', async () => {
    // handleWebsiteInquiry already drafts + alerts on its own initial
    // acknowledgment message, so checkpoint the audit log afterward and only
    // look at rows added by the (blocked) second draft below.
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    await flush();
    const checkpoint = (db.prepare(`SELECT MAX(id) as maxId FROM audit_log`).get() as { maxId: number }).maxId ?? 0;

    const { setPaused } = await import('../../src/audit/index.js');
    setPaused(true);
    try {
      const draft = draftTemplateMessage({
        jobId: initial.jobId,
        customerId: initial.customerId,
        channel: 'website',
        templateKey: 'appointment_reminder',
        vars: { customerFirstName: 'Jane', window: 'Monday morning' },
      });
      expect(draft.status).toBe('blocked');
      await flush();

      const rows = db
        .prepare(`SELECT action FROM audit_log WHERE id > ? AND action LIKE 'alert_%'`)
        .all(checkpoint) as { action: string }[];
      expect(rows).toHaveLength(0);
    } finally {
      setPaused(false);
    }
  });
});
