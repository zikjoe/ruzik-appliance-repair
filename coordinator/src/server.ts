import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { handleWebsiteInquiry, handleFreeTextInquiry, handleFollowUpMessage } from './lib/orchestrate.js';
import { approveAndSend, rejectMessage } from './messaging/index.js';
import { setPaused, isPaused, exportAll } from './audit/index.js';
import { generateDailyReport, formatReportAsText } from './reporting/index.js';
import * as jobsRepo from './db/jobsRepo.js';
import * as customersRepo from './db/customersRepo.js';
import * as messagesRepo from './db/messagesRepo.js';
import * as escalationsRepo from './db/escalationsRepo.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Admin auth ───────────────────────────────────────────────────────────
// Minimum-access principle (job description § Technical and Ownership
// Requirements): admin routes require a shared secret. Left open with a
// console warning only for local pilot testing when ADMIN_TOKEN is unset —
// go-live-checklist.md calls out setting this before any real deployment.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.warn('[coordinator] ADMIN_TOKEN not set — /admin/* routes are UNPROTECTED. Set this before going live.');
}
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) return next();
  if (req.header('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ── Channel 1: Website inquiries ────────────────────────────────────────
// Configure as a Netlify "outgoing webhook" form notification pointed at
// this URL — see docs/go-live-checklist.md. Payload shape matches Netlify's
// form-submission webhook, wrapping fields under `data`.
const netlifyFormSchema = z.object({
  data: z.record(z.string(), z.string().optional()),
});
app.post('/webhooks/website', (req, res) => {
  const parsed = netlifyFormSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const result = handleWebsiteInquiry(parsed.data as never);
  res.json(result);
});

// ── Channels 2 & 3: SMS / missed-call text-back ─────────────────────────
// Mock channel for the pilot (no live Twilio account yet). Accepts the
// minimum needed to exercise the same code path a real Twilio inbound
// webhook would drive; see docs/go-live-checklist.md for the real field
// mapping (From/Body) once a number is provisioned.
const smsSchema = z.object({
  phone: z.string().min(7),
  text: z.string().min(1),
  channel: z.enum(['sms', 'missed_call']).default('sms'),
});
app.post('/webhooks/sms', async (req, res) => {
  const parsed = smsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const { phone, text, channel } = parsed.data;
  const result = await handleFreeTextInquiry({ channel, phone, text });
  res.json(result);
});

// ── Follow-up inbound messages on an existing job (customer replies) ───
// Runs the same safety-scan-first / escalation-classifier pipeline as a
// brand-new inquiry — see src/lib/orchestrate.ts handleFollowUpMessage.
const inboundSchema = z.object({
  jobId: z.number().int(),
  customerId: z.number().int().optional(),
  channel: z.enum(['website', 'sms', 'missed_call']),
  body: z.string().min(1),
});
app.post('/webhooks/inbound-message', (req, res) => {
  const parsed = inboundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const result = handleFollowUpMessage(parsed.data);
  res.json(result);
});

// ── Admin: copilot-mode approval queue ──────────────────────────────────
app.get('/admin/approvals', requireAdmin, (_req, res) => {
  res.json({ messages: messagesRepo.listPendingApproval(), escalations: escalationsRepo.listOpen() });
});

app.post('/admin/messages/:id/approve', requireAdmin, (req, res) => {
  const result = approveAndSend(Number(req.params.id));
  res.json(result);
});

app.post('/admin/messages/:id/reject', requireAdmin, (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'owner_rejected';
  rejectMessage(Number(req.params.id), reason);
  res.json({ rejected: true });
});

app.post('/admin/escalations/:id/resolve', requireAdmin, (req, res) => {
  escalationsRepo.resolve(Number(req.params.id));
  res.json({ resolved: true });
});

// ── Admin: pause switch (job description: "manual pause switch") ───────
app.post('/admin/pause', requireAdmin, (_req, res) => {
  setPaused(true);
  res.json({ paused: true });
});
app.post('/admin/resume', requireAdmin, (_req, res) => {
  setPaused(false);
  res.json({ paused: false });
});
app.get('/admin/status', requireAdmin, (_req, res) => {
  res.json({ paused: isPaused() });
});

// ── Admin: export + reporting ───────────────────────────────────────────
app.get('/admin/export', requireAdmin, (_req, res) => {
  res.json(exportAll());
});
app.get('/admin/report', requireAdmin, (req, res) => {
  const report = generateDailyReport(typeof req.query.date === 'string' ? req.query.date : undefined);
  if (req.query.format === 'text') {
    res.type('text/plain').send(formatReportAsText(report));
  } else {
    res.json(report);
  }
});

app.get('/admin/jobs/:id', requireAdmin, (req, res) => {
  const jobId = Number(req.params.id);
  const job = jobsRepo.getById(jobId);
  if (!job) return res.status(404).json({ error: 'not_found' });
  const customer = customersRepo.getById(job.customer_id);
  const messages = messagesRepo.listForJob(jobId);
  const escalations = escalationsRepo.listForJob(jobId);
  res.json({ job, customer, messages, escalations });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[coordinator] listening on :${port}`);
  });
}

export { app };
