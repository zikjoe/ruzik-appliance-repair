import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { spendingLimits } from './config.js';
import { logAction } from '../audit/index.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. This is expected in the pilot sandbox — see docs/go-live-checklist.md.'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function todayCallCount(): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM audit_log
       WHERE action = 'claude_api_call' AND date(ts) = date('now')`
    )
    .get() as { n: number };
  return row.n;
}

/** Enforces config/spending-limits.json before every model call. Fails closed:
 * if the daily cap is hit, the call is refused and the caller must escalate
 * instead of silently degrading. See job description § Technical and
 * Ownership Requirements ("spending limits and usage alerts"). */
export function assertUnderSpendingCap(): void {
  const count = todayCallCount();
  if (count >= spendingLimits.dailyClaudeApiCallCap) {
    logAction({
      action: 'spending_cap_exceeded',
      recordType: 'system',
      outcome: 'blocked',
      detail: `${count} calls today, cap is ${spendingLimits.dailyClaudeApiCallCap}`,
    });
    throw new SpendingCapExceededError(count);
  }
}

export class SpendingCapExceededError extends Error {
  constructor(public callsToday: number) {
    super(`Daily Claude API call cap reached (${callsToday} calls). Escalating instead of calling the model.`);
  }
}

/** Thin wrapper around the Messages API. Every call is logged (for the cap
 * check above and for cost visibility) BEFORE the network call, so a crash
 * mid-call still counts against the cap rather than allowing a retry storm. */
export async function callClaude(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  jobId?: number;
}): Promise<string> {
  assertUnderSpendingCap();
  logAction({
    action: 'claude_api_call',
    recordType: 'job',
    recordId: opts.jobId,
    outcome: 'allowed',
    detail: opts.system.slice(0, 80),
  });
  const response = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}
