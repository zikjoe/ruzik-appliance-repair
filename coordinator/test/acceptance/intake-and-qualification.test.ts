import { describe, it, expect } from 'vitest';
import { handleWebsiteInquiry, handleFollowUpMessage } from '../../src/lib/orchestrate.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload, uniquePhone } from './helpers.js';

describe('1. Normal booking', () => {
  it('books an in-area, supported-service, complete-info job with no escalation', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload());
    expect(result.safetyEscalated).toBe(false);
    expect(result.needsHumanReview).toBe(false);
    expect(result.outboundBody).toMatch(/Ruzik Appliance Repair/);

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.jobId) as { technician_id: number | null };
    expect(job.technician_id).not.toBeNull();

    const escalations = db.prepare('SELECT * FROM escalations WHERE job_id = ?').all(result.jobId);
    expect(escalations).toHaveLength(0);
  });

  it('books a different supported appliance (dishwasher) cleanly', () => {
    const result = handleWebsiteInquiry(
      makeWebsitePayload({ appliance: 'dishwasher', message: 'Dishwasher leaks from the bottom door seal.' })
    );
    expect(result.needsHumanReview).toBe(false);
  });
});

describe('2. Unsupported service', () => {
  it('flags an appliance with no published price range for human review', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload({ appliance: 'refrigerator' }));
    expect(result.needsHumanReview).toBe(true);
    const job = db.prepare('SELECT human_review_reason FROM jobs WHERE id = ?').get(result.jobId) as {
      human_review_reason: string;
    };
    expect(job.human_review_reason).toContain('no_published_price_range_for_appliance');
  });

  it('flags a completely unsupported appliance type for human review', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload({ appliance: 'wine-cooler' }));
    expect(result.needsHumanReview).toBe(true);
    const job = db.prepare('SELECT human_review_reason FROM jobs WHERE id = ?').get(result.jobId) as {
      human_review_reason: string;
    };
    expect(job.human_review_reason).toContain('appliance_not_in_supported_list');
  });
});

describe('3. Out-of-area customer', () => {
  it('routes an out-of-metro ZIP to human review instead of a hard rejection', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload({ zip: '90210' }));
    expect(result.needsHumanReview).toBe(true);
    const job = db.prepare('SELECT human_review_reason FROM jobs WHERE id = ?').get(result.jobId) as {
      human_review_reason: string;
    };
    expect(job.human_review_reason).toContain('zip_outside_known_service_area');
  });

  it('routes a missing/unrecognized ZIP to human review, never auto-rejects', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload({ zip: '' }));
    expect(result.needsHumanReview).toBe(true);
  });
});

describe('4. Missing model number', () => {
  it('does not escalate solely for a missing optional model number', () => {
    const result = handleWebsiteInquiry(makeWebsitePayload({ model: '', brand: '' }));
    expect(result.needsHumanReview).toBe(false);
    const escalations = db.prepare('SELECT * FROM escalations WHERE job_id = ?').all(result.jobId);
    expect(escalations).toHaveLength(0);
  });
});

describe('5. Price objection', () => {
  it('does not escalate a plain price objection on an open job', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      body: "That's way more than I expected honestly, is there any way to bring it down a bit?",
    });
    expect(followUp.safetyEscalated).toBe(false);
    expect(followUp.triggers).toHaveLength(0);
  });
});

describe('11. Duplicate customer', () => {
  it('flags a second open job for the same customer + appliance as a likely duplicate', () => {
    const phone = uniquePhone();
    const first = handleWebsiteInquiry(makeWebsitePayload({ phone }));
    const second = handleWebsiteInquiry(makeWebsitePayload({ phone, name: 'Jane Smith' }));

    expect(second.customerId).toBe(first.customerId);

    const customers = db.prepare('SELECT * FROM customers WHERE phone = ?').all(phone);
    expect(customers).toHaveLength(1);

    const escalations = db.prepare('SELECT * FROM escalations WHERE job_id = ?').all(second.jobId) as {
      trigger: string;
      detail: string;
    }[];
    expect(escalations.some((e) => e.detail?.includes('possible duplicate'))).toBe(true);
  });
});
