import { db } from './index.js';
import type { CustomerRow } from './types.js';

/** Everything that touches the `customers` table lives here. Nothing
 * outside this file should know the table's column names. */

export function getById(id: number): CustomerRow | undefined {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as CustomerRow | undefined;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

/** Matches by normalized phone (so "404-555-0100" and "(404) 555-0100"
 * collide) or exact email. Phone comparison is done in JS rather than SQL
 * since normalization isn't expressible as a plain column match — fine at
 * pilot scale, revisit if the customer list gets large enough to matter. */
export function findByPhoneOrEmail(opts: { phone?: string; email?: string }): CustomerRow | undefined {
  if (opts.phone) {
    const normalized = normalizePhone(opts.phone);
    const rows = db.prepare(`SELECT * FROM customers WHERE phone IS NOT NULL`).all() as CustomerRow[];
    const match = rows.find((r) => r.phone && normalizePhone(r.phone) === normalized);
    if (match) return match;
  }
  if (opts.email) {
    const match = db.prepare(`SELECT * FROM customers WHERE lower(email) = lower(?)`).get(opts.email) as
      | CustomerRow
      | undefined;
    if (match) return match;
  }
  return undefined;
}

export function create(fields: {
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  zip?: string;
  propertyType?: string;
  accessInstructions?: string;
  referralSource?: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO customers (full_name, phone, email, address, zip, property_type, access_notes, referral_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.fullName,
      fields.phone ?? null,
      fields.email ?? null,
      fields.address ?? null,
      fields.zip ?? null,
      fields.propertyType ?? null,
      fields.accessInstructions ?? null,
      fields.referralSource ?? null
    );
  return result.lastInsertRowid as number;
}

/** Fills in whatever's provided, leaves existing values alone otherwise —
 * a returning customer's second inquiry shouldn't blank out fields the
 * first one already captured. */
export function update(
  id: number,
  fields: { fullName?: string; address?: string; zip?: string; email?: string }
): void {
  db.prepare(
    `UPDATE customers SET
       full_name = COALESCE(?, full_name),
       address = COALESCE(?, address),
       zip = COALESCE(?, zip),
       email = COALESCE(?, email),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(fields.fullName ?? null, fields.address ?? null, fields.zip ?? null, fields.email ?? null, id);
}
