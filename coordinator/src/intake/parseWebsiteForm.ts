import type { IntakeFields } from '../lib/types.js';

/** The existing contact.html form (see repo root) already collects
 * structured fields via Netlify Forms — no LLM extraction needed for this
 * channel, just a direct field mapping. This is intentionally deterministic:
 * fewer moving parts for the highest-volume channel.
 *
 * Netlify's outgoing-webhook payload wraps submitted fields under `data`.
 * Field names below match the `name` attributes in contact.html exactly. */
export interface NetlifyFormPayload {
  data: {
    name?: string;
    phone?: string;
    email?: string;
    'service-type'?: string;
    appliance?: string;
    brand?: string;
    model?: string;
    message?: string;
    zip?: string;
    'preferred-time'?: string;
  };
}

const APPLIANCE_LABEL_TO_KEY: Record<string, string> = {
  dryer: 'dryer',
  dishwasher: 'dishwasher',
  washer: 'washer',
  stove: 'stove',
  microwave: 'microwave',
  refrigerator: 'refrigerator',
  other: 'other',
};

export function parseWebsiteForm(payload: NetlifyFormPayload): IntakeFields {
  const d = payload.data;
  return {
    fullName: d.name?.trim(),
    phone: d.phone?.trim(),
    email: d.email?.trim() || undefined,
    zip: d.zip?.trim(),
    serviceType: d['service-type']?.trim(),
    appliance: d.appliance ? APPLIANCE_LABEL_TO_KEY[d.appliance] ?? d.appliance : undefined,
    brand: d.brand?.trim() || undefined,
    model: d.model?.trim() || undefined,
    problemDescription: d.message?.trim(),
    preferredWindows: d['preferred-time'] ? [d['preferred-time']] : undefined,
    referralSource: 'website_contact_form',
  };
}
