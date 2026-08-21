/** Row shapes matching db/schema.sql exactly. Defined once here so no
 * consumer needs its own ad hoc `as {...}` cast on a raw query result —
 * that duplication is exactly what let the same table end up with two
 * different write paths (see messagesRepo.ts). */

export interface CustomerRow {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  zip: string | null;
  property_type: string | null;
  access_notes: string | null;
  referral_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicianRow {
  id: number;
  name: string;
  phone: string | null;
  skills: string; // JSON array
  zones: string; // JSON array
  active: number;
  created_at: string;
}

export interface JobRow {
  id: number;
  customer_id: number;
  channel: string;
  status: string;
  address: string | null;
  zip: string | null;
  service_type: string | null;
  appliance: string | null;
  brand: string | null;
  model: string | null;
  problem_description: string | null;
  has_media: number;
  preferred_windows: string | null;
  urgent: number;
  in_service_area: number | null;
  service_supported: number | null;
  technician_id: number | null;
  technician_accepted: number | null;
  scheduled_window: string | null;
  diagnosis: string | null;
  work_performed: string | null;
  parts_used: string | null;
  invoice_amount_cents: number | null;
  payment_status: string | null;
  before_photo_ref: string | null;
  after_photo_ref: string | null;
  warranty_terms: string | null;
  warranty_expires: string | null;
  satisfaction_outcome: string | null;
  review_request_status: string | null;
  needs_human_review: number;
  human_review_reason: string | null;
  duplicate_of_job_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  job_id: number | null;
  customer_id: number | null;
  direction: 'inbound' | 'outbound';
  channel: string;
  template_key: string | null;
  body: string;
  status: string;
  blocked_reason: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
}

export interface EscalationRow {
  id: number;
  job_id: number | null;
  trigger: string;
  detail: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}
