import { describe, it, expect } from 'vitest';
import { handleWebsiteInquiry, handleFollowUpMessage } from '../../src/lib/orchestrate.js';
import { offerApprovedWindows, requestCancellation, confirmCancellation } from '../../src/scheduling/index.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload } from './helpers.js';

describe('6. Cancellation', () => {
  it('escalates a cancellation request instead of auto-cancelling', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      body: 'I need to cancel my appointment, found someone else.',
    });
    expect(followUp.triggers).toContain('cancellation');

    const jobBefore = db.prepare('SELECT status FROM jobs WHERE id = ?').get(initial.jobId) as { status: string };
    expect(jobBefore.status).not.toBe('cancelled');

    confirmCancellation(initial.jobId);
    const jobAfter = db.prepare('SELECT status FROM jobs WHERE id = ?').get(initial.jobId) as { status: string };
    expect(jobAfter.status).toBe('cancelled');
  });

  it('requestCancellation directly raises an open escalation', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    requestCancellation(initial.jobId, 'customer called to cancel');
    const escalations = db.prepare('SELECT * FROM escalations WHERE job_id = ?').all(initial.jobId) as {
      trigger: string;
    }[];
    expect(escalations.some((e) => e.trigger === 'cancellation')).toBe(true);
  });
});

describe('7. Rescheduling', () => {
  it('handles a plain reschedule request without escalating, offering only approved windows', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'website',
      body: 'Can we push this to next week instead?',
    });
    expect(followUp.safetyEscalated).toBe(false);
    expect(followUp.triggers).toHaveLength(0);

    const windows = offerApprovedWindows();
    expect(windows.length).toBeGreaterThan(0);
    // Every offered window must come from the approved config, never invented.
    for (const w of windows) {
      expect(['morning', 'afternoon', 'evening']).toContain(w.windowKey);
    }
  });
});

describe('8. Late technician', () => {
  it('escalates a reported late/no-show technician', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'sms',
      body: 'Technician is running late, was supposed to be here an hour ago.',
    });
    expect(followUp.triggers).toContain('late_arrival');
  });
});

describe('9. Warranty callback', () => {
  it('escalates a warranty callback report', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'sms',
      body: 'The dryer stopped working again, same problem as before. Is this still under warranty?',
    });
    expect(followUp.triggers).toContain('warranty_callback');
  });
});
