import { describe, it, expect } from 'vitest';
import { handleWebsiteInquiry, handleFollowUpMessage } from '../../src/lib/orchestrate.js';
import { SAFETY_REDIRECT_MESSAGE } from '../../src/guardrails/index.js';
import { db } from '../../src/db/index.js';
import { makeWebsitePayload } from './helpers.js';

describe('12. Safety hazards — always escalate, always a fixed redirect, never AI-composed', () => {
  const cases: { label: string; message: string; category: string }[] = [
    { label: 'gas smell', message: 'I smell gas near the stove, it smells like rotten eggs.', category: 'gas' },
    { label: 'smoke', message: 'There is smoke coming out of the back of the dryer.', category: 'fire_smoke' },
    { label: 'flooding', message: 'My laundry room is flooding, water everywhere on the floor.', category: 'flooding' },
    {
      label: 'electrical shock',
      message: 'I got shocked when I touched the dishwasher, there is an exposed wire.',
      category: 'electrical',
    },
    { label: 'injury', message: 'I burned myself trying to unplug the microwave.', category: 'injury' },
  ];

  for (const c of cases) {
    it(`escalates and sends the fixed safety redirect for: ${c.label}`, () => {
      const result = handleWebsiteInquiry(makeWebsitePayload({ message: c.message }));
      expect(result.safetyEscalated).toBe(true);
      expect(result.needsHumanReview).toBe(true);
      expect(result.outboundBody).toBeUndefined(); // safety path returns messageId, not body, by design

      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.outboundMessageId) as {
        body: string;
        status: string;
        template_key: string;
      };
      expect(message.body).toBe(SAFETY_REDIRECT_MESSAGE);
      expect(message.status).toBe('sent'); // sent immediately, not queued for approval
      expect(message.template_key).toBe('safety_redirect');

      const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(result.jobId) as { status: string };
      expect(job.status).toBe('needs_human');

      const escalations = db.prepare('SELECT * FROM escalations WHERE job_id = ?').all(result.jobId) as {
        trigger: string;
        detail: string;
      }[];
      expect(escalations.some((e) => e.trigger === 'safety_hazard' && e.detail === c.category)).toBe(true);
    });
  }

  it('also catches a hazard reported in a follow-up message on an already-open job', () => {
    const initial = handleWebsiteInquiry(makeWebsitePayload());
    const followUp = handleFollowUpMessage({
      jobId: initial.jobId,
      customerId: initial.customerId,
      channel: 'sms',
      body: 'Update — now I smell gas near the unit, please help.',
    });
    expect(followUp.safetyEscalated).toBe(true);
    expect(followUp.triggers).toContain('safety_hazard');

    const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(initial.jobId) as { status: string };
    expect(job.status).toBe('needs_human');
  });
});
