import { db } from '../db/index.js';
import { logAction } from '../audit/index.js';

export interface DailyReport {
  date: string;
  newInquiries: number;
  qualifiedLeads: number;
  jobsBooked: number;
  jobsCompleted: number;
  unansweredOrStalledLeads: number;
  cancellations: number;
  revenueCollectedCents: number;
  outstandingBalanceCents: number;
  technicianIssues: number;
  complaintsAndCallbacks: number;
  itemsRequiringOwnerApproval: number;
}

/** job description § 7 Daily Reporting — the exact metric list, each defined
 * against the schema. Some are necessarily proxies for a pilot with no
 * "status changed at" history per-field (e.g. "jobs booked today" uses
 * created_at as a stand-in for booked-today); each definition is documented
 * inline so the owner can sanity-check them against what they actually see. */
export function generateDailyReport(dateISO?: string): DailyReport {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);

  const countToday = (sql: string) => (db.prepare(sql).get(date) as { n: number }).n;
  const sumToday = (sql: string) => (db.prepare(sql).get(date) as { total: number | null }).total ?? 0;

  const newInquiries = countToday(`SELECT COUNT(*) as n FROM jobs WHERE date(created_at) = ?`);

  const qualifiedLeads = countToday(
    `SELECT COUNT(*) as n FROM jobs WHERE date(created_at) = ? AND in_service_area = 1 AND service_supported = 1`
  );

  const jobsBooked = countToday(
    `SELECT COUNT(*) as n FROM jobs WHERE date(created_at) = ? AND status IN ('scheduled','in_progress','awaiting_parts','completed','closed')`
  );

  const jobsCompleted = countToday(
    `SELECT COUNT(*) as n FROM jobs WHERE status IN ('completed','closed') AND date(updated_at) = ?`
  );

  const unansweredOrStalledLeads = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM jobs
         WHERE status IN ('new_lead','qualifying')
           AND created_at < datetime('now', '-2 hours')`
      )
      .get() as { n: number }
  ).n;

  const cancellations = countToday(
    `SELECT COUNT(*) as n FROM jobs WHERE status = 'cancelled' AND date(updated_at) = ?`
  );

  const revenueCollectedCents = sumToday(
    `SELECT SUM(invoice_amount_cents) as total FROM jobs WHERE payment_status = 'paid' AND date(updated_at) = ?`
  );

  const outstandingBalanceCents = (
    db
      .prepare(`SELECT SUM(invoice_amount_cents) as total FROM jobs WHERE payment_status = 'outstanding'`)
      .get() as { total: number | null }
  ).total ?? 0;

  const technicianIssues = countToday(
    `SELECT COUNT(*) as n FROM escalations
     WHERE trigger IN ('technician_payment_request','ai_uncertain')
       AND detail LIKE '%technician%'
       AND date(created_at) = ?`
  );

  const complaintsAndCallbacks = countToday(
    `SELECT COUNT(*) as n FROM escalations
     WHERE trigger IN ('angry_or_threatening','charge_dispute','warranty_callback')
       AND date(created_at) = ?`
  );

  const itemsRequiringOwnerApproval =
    (db.prepare(`SELECT COUNT(*) as n FROM messages WHERE status = 'pending_approval'`).get() as { n: number }).n +
    (db.prepare(`SELECT COUNT(*) as n FROM escalations WHERE status = 'open'`).get() as { n: number }).n;

  const report: DailyReport = {
    date,
    newInquiries,
    qualifiedLeads,
    jobsBooked,
    jobsCompleted,
    unansweredOrStalledLeads,
    cancellations,
    revenueCollectedCents,
    outstandingBalanceCents,
    technicianIssues,
    complaintsAndCallbacks,
    itemsRequiringOwnerApproval,
  };

  logAction({ action: 'generate_daily_report', recordType: 'system', outcome: 'allowed', detail: date });
  return report;
}

export function formatReportAsText(report: DailyReport): string {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  return [
    `Ruzik AI Coordinator — Daily Report for ${report.date}`,
    `New inquiries: ${report.newInquiries}`,
    `Qualified leads: ${report.qualifiedLeads}`,
    `Jobs booked: ${report.jobsBooked}`,
    `Jobs completed: ${report.jobsCompleted}`,
    `Unanswered/stalled leads (>2h): ${report.unansweredOrStalledLeads}`,
    `Cancellations: ${report.cancellations}`,
    `Revenue collected: ${usd(report.revenueCollectedCents)}`,
    `Outstanding balances: ${usd(report.outstandingBalanceCents)}`,
    `Technician issues: ${report.technicianIssues}`,
    `Complaints/callbacks: ${report.complaintsAndCallbacks}`,
    `Items requiring owner approval: ${report.itemsRequiringOwnerApproval}`,
  ].join('\n');
}
