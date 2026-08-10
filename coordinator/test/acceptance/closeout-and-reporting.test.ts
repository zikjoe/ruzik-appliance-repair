import { describe, it, expect } from 'vitest';
import { handleWebsiteInquiry } from '../../src/lib/orchestrate.js';
import { validateCloseout, closeJob } from '../../src/closeout/index.js';
import { generateDailyReport, formatReportAsText } from '../../src/reporting/index.js';
import { exportAll } from '../../src/audit/index.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload } from './helpers.js';

describe('Job closeout checklist', () => {
  it('refuses to close a job missing required closeout fields', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const check = closeJob(initial.jobId);
    expect(check.complete).toBe(false);
    expect(check.missing).toContain('diagnosis');
    expect(check.missing).toContain('invoice');

    const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(initial.jobId) as { status: string };
    expect(job.status).not.toBe('closed');
  });

  it('closes a job once every checklist field is filled', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    db.prepare(
      `UPDATE jobs SET
         diagnosis = ?, work_performed = ?, parts_used = ?, invoice_amount_cents = ?,
         payment_status = ?, before_photo_ref = ?, after_photo_ref = ?,
         warranty_terms = ?, warranty_expires = ?, satisfaction_outcome = ?, review_request_status = ?
       WHERE id = ?`
    ).run(
      'Failed thermal fuse',
      'Replaced thermal fuse and tested full cycle',
      'Thermal fuse (OEM)',
      12500,
      'paid',
      'photo://before/1',
      'photo://after/1',
      '90-day parts and labor warranty',
      '2026-11-08',
      'satisfied',
      'sent',
      initial.jobId
    );
    const check = validateCloseout(initial.jobId);
    expect(check.complete).toBe(true);

    const closed = closeJob(initial.jobId);
    expect(closed.complete).toBe(true);
    const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(initial.jobId) as { status: string };
    expect(job.status).toBe('closed');
  });
});

describe('Daily reporting', () => {
  it('produces every metric from the job description', () => {
    handleWebsiteInquiry(makeWebsitePayload());
    handleWebsiteInquiry(makeWebsitePayload({ zip: '90210' })); // triggers a review-needed lead

    const report = generateDailyReport();
    expect(report.newInquiries).toBeGreaterThanOrEqual(2);
    expect(report).toHaveProperty('qualifiedLeads');
    expect(report).toHaveProperty('jobsBooked');
    expect(report).toHaveProperty('jobsCompleted');
    expect(report).toHaveProperty('unansweredOrStalledLeads');
    expect(report).toHaveProperty('cancellations');
    expect(report).toHaveProperty('revenueCollectedCents');
    expect(report).toHaveProperty('outstandingBalanceCents');
    expect(report).toHaveProperty('technicianIssues');
    expect(report).toHaveProperty('complaintsAndCallbacks');
    expect(report.itemsRequiringOwnerApproval).toBeGreaterThan(0);

    const text = formatReportAsText(report);
    expect(text).toContain('Daily Report');
  });
});

describe('Audit log + export', () => {
  it('logs every state-changing action with time, action, record, and outcome', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const rows = db.prepare('SELECT * FROM audit_log WHERE record_type = ? AND record_id = ?').all(
      'job',
      String(initial.jobId)
    ) as { ts: string; action: string; outcome: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.ts).toBeTruthy();
      expect(row.action).toBeTruthy();
      expect(row.outcome).toBeTruthy();
    }
  });

  it('exports every table for owner backup/portability', () => {
    handleWebsiteInquiry(makeWebsitePayload());
    const bundle = exportAll();
    expect(bundle.customers.length).toBeGreaterThan(0);
    expect(bundle.jobs.length).toBeGreaterThan(0);
    expect(bundle.technicians.length).toBeGreaterThan(0);
    expect(bundle.auditLog.length).toBeGreaterThan(0);
    expect(bundle.exportedAt).toBeTruthy();
  });
});
