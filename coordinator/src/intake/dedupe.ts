import { db } from '../db/index.js';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

export interface CustomerRow {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

/** Finds an existing customer by phone (normalized) or exact email match.
 * Per job description § 1: "Create one job record and prevent duplicate
 * entries." This only matches CUSTOMERS, not jobs — a returning customer
 * with a new problem still gets a new job row against the same customer_id;
 * true duplicate-job detection (same customer, same open issue) happens in
 * intake/createJob.ts. */
export function findExistingCustomer(opts: { phone?: string; email?: string }): CustomerRow | undefined {
  if (opts.phone) {
    const normalized = normalizePhone(opts.phone);
    const rows = db.prepare(`SELECT * FROM customers WHERE phone IS NOT NULL`).all() as CustomerRow[];
    const match = rows.find((r) => r.phone && normalizePhone(r.phone) === normalized);
    if (match) return match;
  }
  if (opts.email) {
    const match = db
      .prepare(`SELECT * FROM customers WHERE lower(email) = lower(?)`)
      .get(opts.email) as CustomerRow | undefined;
    if (match) return match;
  }
  return undefined;
}

/** Detects a likely duplicate job: same customer with an open (not
 * completed/closed/cancelled) job for the same appliance created recently.
 * Flags for human review rather than silently merging or silently creating a
 * second job — see acceptance test scenario "duplicate customer". */
export function findLikelyDuplicateJob(customerId: number, appliance: string | undefined) {
  return db
    .prepare(
      `SELECT * FROM jobs
       WHERE customer_id = ?
         AND appliance = ?
         AND status NOT IN ('completed', 'closed', 'cancelled')
         AND created_at > datetime('now', '-30 days')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(customerId, appliance ?? null);
}
