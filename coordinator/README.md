# Ruzik AI Dispatch & Customer Care Coordinator

A narrow, single-workflow AI pilot for Ruzik Appliance Repair — lead intake,
qualification, scheduling assistance, customer/technician communication, job
closeout, and daily reporting. Built as a 30-day **copilot-mode** pilot per
the job description this repo was scoped from: one workflow, a hard
allow-list of actions, mandatory human escalation, full audit logging, a
manual pause switch, and nothing sent to a real customer without
review-and-approve first.

This is a companion project to the static marketing site in the repo root —
it does not modify that site's code. See `docs/go-live-checklist.md` for the
one config step (a Netlify outgoing webhook) that connects them.

## Quick start

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY if you want SMS field extraction
npm test                # runs the full pilot acceptance suite — no API key required
npm run build && npm start
# or: npm run dev
```

Server listens on `:3000` by default (`PORT` env var to change).

## What's here

| Path | What |
|---|---|
| `src/db/*Repo.ts` | The only files that write SQL against `customers`/`jobs`/`technicians`/`messages`/`escalations`. Every other module (below) goes through these — no other file should know a column name. `src/audit` and `src/reporting` are the two documented exceptions: audit owns `audit_log`/`system_state` outright, and reporting's read-only cross-table aggregates aren't entity CRUD. |
| `src/intake/` | Lead intake: field extraction (deterministic for the website form, Claude-assisted for free-text SMS), dedup |
| `src/qualify/` | Service-area / service-type qualification |
| `src/guardrails/` | The authority allow-list, forbidden-action list, escalation-trigger classifiers, safety-hazard scanner, pause-switch gate |
| `src/scheduling/` | Approved-window offering, technician matching, job summaries, cancellation/reschedule handling |
| `src/messaging/` | The 10 approved message templates, copilot-mode drafting + approval/send/reject, bot-disclosure rule |
| `src/closeout/` | Job-closeout checklist gate |
| `src/reporting/` | Daily summary metrics |
| `src/audit/` | Audit log, pause switch, full data export |
| `src/notify/` | Real-time owner alerts (email + SMS) on every escalation and every message that lands in the approval queue — no-ops with a logged reason until real SMTP/Twilio credentials are set |
| `src/lib/orchestrate.ts` | Ties the above together per inbound channel |
| `src/server.ts` | Express app: webhook + admin endpoints |
| `config/*.json` | Every tunable the AI operates within — price list, service area, templates, escalation keywords, spending caps. Seeded from the real site content in the repo root, not placeholders. |
| `test/acceptance/` | The 25-50 scripted scenarios required by the Pilot Acceptance Test — `npm test` |
| `docs/` | Pilot plan, authority matrix, metrics definitions, ownership checklist, runbook, go-live steps |
| `docs/architecture.html` | Interactive schematic of the whole request pipeline — open it directly in a browser, or ask Claude to republish it as an Artifact. Hand-authored, not generated — update it when the pipeline shape changes, not on every commit. |
| `docs/roadmap.md` | Mermaid flowchart of what's left before go-live (GitHub Issues #2–#12) and how they block each other. Issues are the source of truth — this is a snapshot, not a sync. |

## Explicitly not built (Phase-One Channels)

Voice calls, autonomous pricing, payments, contractor payouts, and parts
purchasing are out of scope for this pilot by design — see the job
description's Phase-One Channels section and `docs/pilot-plan.md`.

## Admin endpoints

All under `/admin/*`, protected by the `ADMIN_TOKEN` env var (`x-admin-token`
header) once set — unset locally for pilot testing only.

- `GET /admin/approvals` — pending messages + open escalations
- `POST /admin/messages/:id/approve` / `/reject`
- `POST /admin/pause` / `/resume`
- `GET /admin/export` — full data dump
- `GET /admin/report?format=text` — daily summary
- `GET /admin/jobs/:id` — full job thread
