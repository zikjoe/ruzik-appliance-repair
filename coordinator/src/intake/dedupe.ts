import * as customersRepo from '../db/customersRepo.js';
import * as jobsRepo from '../db/jobsRepo.js';
import type { CustomerRow } from '../db/types.js';

/** Finds an existing customer by phone (normalized) or exact email match.
 * Per job description § 1: "Create one job record and prevent duplicate
 * entries." This only matches CUSTOMERS, not jobs — a returning customer
 * with a new problem still gets a new job row against the same customer_id;
 * true duplicate-job detection (same customer, same open issue) is
 * findLikelyDuplicateJob below. */
export function findExistingCustomer(opts: { phone?: string; email?: string }): CustomerRow | undefined {
  return customersRepo.findByPhoneOrEmail(opts);
}

/** Detects a likely duplicate job: same customer with an open (not
 * completed/closed/cancelled) job for the same appliance created recently.
 * Flags for human review rather than silently merging or silently creating a
 * second job — see acceptance test scenario "duplicate customer". */
export function findLikelyDuplicateJob(customerId: number, appliance: string | undefined) {
  return jobsRepo.findLikelyDuplicate(customerId, appliance);
}
