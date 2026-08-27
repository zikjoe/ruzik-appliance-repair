import { describe, it, expect } from 'vitest';
import { handleWebsiteInquiry } from '../../src/lib/orchestrate.js';
import { validateCloseout, closeJob, recordCloseout } from '../../src/closeout/index.js';
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
    recordCloseout(initial.jobId, {
      diagnosis: 'Failed thermal fuse',
      workPerformed: 'Replaced thermal fuse and tested full cycle',
      partsUsed: 'Thermal fuse (OEM)',
      invoiceAmountCents: 12500,
      paymentStatus: 'paid',
      beforePhotoRef: 'photo://before/1',
      afterPhotoRef: 'photo://after/1',
      warrantyTerms: '90-day parts and labor warranty',
      warrantyExpires: '2026-11-08',
      satisfactionOutcome: 'satisfied',
      reviewRequestStatus: 'sent',
    });
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
