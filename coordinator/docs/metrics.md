# Success Metrics

Every metric below is computed live — see `src/reporting/index.ts` — not a
manual spreadsheet.

| Metric | How it's measured | Where |
|---|---|---|
| Median first-response time | Time between job `created_at` and the first outbound message's `sent_at` | Query `messages`/`jobs`; not yet a dedicated report field — add before relying on it for the Week-2 checkpoint |
| % of leads receiving a response | Jobs with at least one `sent` outbound message ÷ total jobs | Derivable from `messages` + `jobs` |
| % of qualified leads booked | Jobs with `status = 'scheduled'` ÷ jobs with `in_service_area=1 AND service_supported=1` | `qualifiedLeads` / booked count in daily report |
| % of records with complete information | Jobs with zero entries in `missingRequiredFields` at intake | Logged via `missing_required_fields` audit action |
| Scheduling-error rate | Escalations with trigger `scheduling_conflict` or `unaccepted_assignment` ÷ total scheduled jobs | `escalations` table |
| Human-escalation rate | Total escalations ÷ total jobs | `escalations` / `jobs` |
| Customer complaints caused by the AI | Escalations with trigger `angry_or_threatening` where the anger followed an AI message (not the original complaint) | Requires manual owner tagging during pilot — not automatable without judgment |
| Owner hours saved | Not measurable from this system alone — track manually against pre-pilot baseline | N/A |
| Token/software cost per booked job | `claude_api_call` audit rows × per-call cost ÷ jobs booked | `audit_log` + your Anthropic billing dashboard |
| Incremental gross profit from faster follow-up | Business metric outside this system — compare booked-job rate pre/post pilot | N/A |

## Initial Performance Targets (from the job description)

- Respond to new inquiries within 2 minutes during operating hours —
  `business.responseTimeTargetMinutes` in `config/business.json`.
- Capture all required info on ≥90% of qualified leads.
- Zero unauthorized pricing/payment/refund decisions — structurally enforced,
  see `authority-matrix.md`, not just a target.
- Scheduling-error rate below 2%.
- Every interaction logged — enforced by `src/audit/logAction`, called from
  every state-changing function in the codebase.
- Safety and payment-dispute escalation without delay — safety hazards send
  a fixed redirect and escalate synchronously, before any other processing;
  see `sendSafetyRedirectImmediately` in `src/lib/orchestrate.ts`.

## The number that actually matters

**Total monthly system cost ÷ incremental completed jobs.** Everything above
feeds this one number. See `pilot-plan.md` Day 30 review.
