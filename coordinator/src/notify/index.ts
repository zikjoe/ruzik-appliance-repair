import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { logAction } from '../audit/index.js';
import { notifications } from '../lib/config.js';

export type AlertUrgency = 'escalation' | 'approval';

export interface AlertOptions {
  urgency: AlertUrgency;
  subject: string;
  body: string;
  jobId?: number;
}

/** The real send logic — awaitable, used directly by tests. Both channels
 * are attempted independently (one failing/missing credentials never blocks
 * the other) and every outcome is audit-logged: sent, skipped (no
 * credentials configured — the pilot-sandbox default), or failed. */
export async function sendAlert(opts: AlertOptions): Promise<void> {
  if (opts.urgency === 'escalation' && !notifications.alertOn.escalations) return;
  if (opts.urgency === 'approval' && !notifications.alertOn.pendingApprovals) return;
  await Promise.all([sendEmail(opts), sendSms(opts)]);
}

/** Fire-and-forget wrapper for the synchronous call sites in guardrails/
 * escalate and messaging/draftTemplateMessage — an alert must never block or
 * throw into the main request-handling flow. */
export function fireAlert(opts: AlertOptions): void {
  void sendAlert(opts).catch((err) => {
    logAction({
      action: 'alert_dispatch_error',
      recordType: 'system',
      recordId: opts.jobId,
      outcome: 'error',
      detail: String(err),
    });
  });
}

async function sendEmail(opts: AlertOptions): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logAction({
      action: 'alert_email_skipped',
      recordType: 'system',
      recordId: opts.jobId,
      outcome: 'allowed',
      detail: 'SMTP credentials not configured — see .env.example',
    });
    return;
  }
  try {
    const port = Number(SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: SMTP_USER,
      to: notifications.recipientEmail,
      subject: `[Ruzik Coordinator] ${opts.subject}`,
      text: opts.body,
    });
    logAction({ action: 'alert_email_sent', recordType: 'system', recordId: opts.jobId, outcome: 'allowed' });
  } catch (err) {
    logAction({
      action: 'alert_email_failed',
      recordType: 'system',
      recordId: opts.jobId,
      outcome: 'error',
      detail: String(err),
    });
  }
}

async function sendSms(opts: AlertOptions): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    logAction({
      action: 'alert_sms_skipped',
      recordType: 'system',
      recordId: opts.jobId,
      outcome: 'allowed',
      detail: 'Twilio credentials not configured — see .env.example',
    });
    return;
  }
  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: TWILIO_FROM_NUMBER,
      to: notifications.recipientPhone,
      body: `[Ruzik Coordinator] ${opts.subject}: ${opts.body}`.slice(0, 300),
    });
    logAction({ action: 'alert_sms_sent', recordType: 'system', recordId: opts.jobId, outcome: 'allowed' });
  } catch (err) {
    logAction({
      action: 'alert_sms_failed',
      recordType: 'system',
      recordId: opts.jobId,
      outcome: 'error',
      detail: String(err),
    });
  }
}
