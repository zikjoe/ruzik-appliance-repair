import { db } from '../db/index.js';
import { appointmentWindows } from '../lib/config.js';
import { logAction } from '../audit/index.js';
import { escalate } from '../guardrails/index.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface OfferedWindow {
  date: string; // YYYY-MM-DD
  dayLabel: string;
  windowKey: string;
  windowLabel: string;
  display: string;
}

/** job description § 3: "Offer only approved appointment windows." Windows
 * come entirely from config/appointment-windows.json — nothing here is
 * invented by the model. */
export function offerApprovedWindows(fromDate: Date = new Date()): OfferedWindow[] {
  const offers: OfferedWindow[] = [];
  let cursor = new Date(fromDate);
  let daysAdded = 0;
  while (offers.length < appointmentWindows.offerDaysAhead * appointmentWindows.daily.length && daysAdded < 14) {
    const dayKey = DAY_KEYS[cursor.getDay()];
    if (appointmentWindows.workingDays.includes(dayKey)) {
      const dateStr = cursor.toISOString().slice(0, 10);
      for (const w of appointmentWindows.daily) {
        offers.push({
          date: dateStr,
          dayLabel: dayKey,
          windowKey: w.key,
          windowLabel: w.label,
          display: `${cursor.toDateString()} — ${w.label}`,
        });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    daysAdded++;
  }
  return offers.slice(0, appointmentWindows.offerDaysAhead * appointmentWindows.daily.length);
}

interface TechnicianRow {
  id: number;
  name: string;
  phone: string | null;
  skills: string;
  zones: string;
  active: number;
}

/** job description § 3: "Match jobs using technician availability, service
 * area, appliance type, brand capability, and workload." Picks the active
 * technician whose skills cover the appliance and whose zones cover the ZIP
 * (or '*'), breaking ties by current open-job count (workload). This is a
 * RECOMMENDATION ONLY (action kind recommend_technician_assignment) — it does
 * not confirm anything; confirmation requires technician acceptance, see
 * recordTechnicianResponse below. */
export function recommendTechnician(jobId: number): { technicianId: number; name: string } | undefined {
  const job = db.prepare(`SELECT appliance, zip FROM jobs WHERE id = ?`).get(jobId) as
    | { appliance: string | null; zip: string | null }
    | undefined;
  if (!job?.appliance) return undefined;

  const techs = db.prepare(`SELECT * FROM technicians WHERE active = 1`).all() as TechnicianRow[];
  const candidates = techs.filter((t) => {
    const skills: string[] = JSON.parse(t.skills);
    const zones: string[] = JSON.parse(t.zones);
    const skillMatch = skills.includes(job.appliance!);
    const zoneMatch = zones.includes('*') || (job.zip ? zones.includes(job.zip) : false);
    return skillMatch && zoneMatch;
  });
  if (candidates.length === 0) return undefined;

  const workloadOf = (techId: number) =>
    (
      db
        .prepare(
          `SELECT COUNT(*) as n FROM jobs WHERE technician_id = ? AND status NOT IN ('completed','closed','cancelled')`
        )
        .get(techId) as { n: number }
    ).n;

  candidates.sort((a, b) => workloadOf(a.id) - workloadOf(b.id));
  const chosen = candidates[0];

  db.prepare(`UPDATE jobs SET technician_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    chosen.id,
    jobId
  );
  logAction({
    action: 'recommend_technician_assignment',
    recordType: 'job',
    recordId: jobId,
    outcome: 'allowed',
    detail: `technician_id=${chosen.id}`,
  });
  return { technicianId: chosen.id, name: chosen.name };
}

/** job description § 3: "Send the technician a structured job summary." */
export function buildTechnicianJobSummary(jobId: number): string {
  const job = db
    .prepare(
      `SELECT j.*, c.full_name, c.address as customer_address, c.zip as customer_zip, c.phone as customer_phone
       FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?`
    )
    .get(jobId) as Record<string, unknown> | undefined;
  if (!job) throw new Error(`Job ${jobId} not found`);

  return [
    `New job #${jobId} — ${job.service_type ?? 'Service'} — ${job.appliance ?? 'appliance TBD'}`,
    `Customer: ${job.full_name} — ${job.customer_phone ?? 'no phone on file'}`,
    `Address: ${job.address ?? job.customer_address ?? 'TBD'} (${job.zip ?? job.customer_zip ?? 'zip TBD'})`,
    `Brand/Model: ${job.brand ?? 'unknown'} / ${job.model ?? 'unknown'}`,
    `Problem: ${job.problem_description ?? ''}`,
    `Preferred windows: ${job.preferred_windows ?? 'none given'}`,
    `Urgent: ${job.urgent ? 'yes' : 'no'}`,
  ].join('\n');
}

/** job description § 3: "Obtain technician acceptance before confirming
 * assignments when required." A technician response of anything other than
 * accept keeps the job in needs_human rather than silently reassigning. */
export function recordTechnicianResponse(
  jobId: number,
  accepted: boolean,
  window?: { date: string; windowLabel: string }
): void {
  if (accepted && window) {
    db.prepare(
      `UPDATE jobs SET technician_accepted = 1, status = 'scheduled', scheduled_window = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(`${window.date} ${window.windowLabel}`, jobId);
    logAction({ action: 'technician_accept', recordType: 'job', recordId: jobId, outcome: 'allowed' });
  } else {
    db.prepare(
      `UPDATE jobs SET technician_accepted = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(jobId);
    escalate({ jobId, trigger: 'unaccepted_assignment', detail: 'technician_declined_or_did_not_respond' });
  }
}

/** job description § 3: "Escalate conflicts, cancellations, late arrivals,
 * and unaccepted assignments." Cancellation always goes through a human —
 * the AI records the request and stops there, it never silently marks a job
 * cancelled on its own initiative. */
export function requestCancellation(jobId: number, reason?: string): void {
  escalate({ jobId, trigger: 'cancellation', detail: reason });
}

/** Owner (or, in this pilot, an admin-approved action) confirms the
 * cancellation after reviewing it — the only path that actually flips job
 * status, keeping "cancel this job" outside the AI's own authority. */
export function confirmCancellation(jobId: number, actor: 'owner' = 'owner'): void {
  db.prepare(`UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(jobId);
  logAction({ actor, action: 'confirm_cancellation', recordType: 'job', recordId: jobId, outcome: 'allowed' });
}
