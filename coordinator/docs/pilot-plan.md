# 30-Day Pilot Plan

Per the brief: start in copilot mode, graduate specific actions to autonomous
only after a track record, and judge the whole thing on
**total monthly system cost ÷ incremental completed jobs** — not token cost.

## Week 0 — Setup (before any real customer sees this)

- [ ] Fill in `docs/ownership-and-access.md` with real answers (hosting,
      phone number, cost caps, support terms) — these are business decisions,
      not something the AI can decide for you.
- [ ] Provision a real Anthropic API key, set `ANTHROPIC_API_KEY` (never
      commit it — see `.env.example`).
- [ ] Provision hosting for the Express app + SQLite file (a small VM or
      container host; SQLite doesn't want a serverless/ephemeral filesystem).
- [ ] Configure the Netlify outgoing webhook for `contact.html` submissions
      → `POST /webhooks/website` (dashboard config, see `go-live-checklist.md`).
- [ ] Set `ADMIN_TOKEN` and confirm `/admin/*` requires it.
- [ ] Run `npm test` — all acceptance scenarios must pass before touching a
      real customer, per the job description's Pilot Acceptance Test.
- [ ] Review every entry in `config/*.json` (price ranges, ZIPs, templates,
      spending caps) — these are the AI's entire authority surface; get them
      right before day 1.

## Weeks 1-2 — Copilot mode, website channel only

- Every drafted message sits in `/admin/approvals` until Isaac approves it.
- Isaac reviews the approval queue and the daily report
  (`GET /admin/report?format=text`) at least once a day.
- Track the Success Metrics below daily. Do not turn on SMS/missed-call
  channels yet — one channel, fully observed, first.

## Week 2 checkpoint — go/no-go on SMS + missed-call-text-back

Turn on channels 2 and 3 (`/webhooks/sms`, real Twilio number once
provisioned) only if:
- Scheduling-error rate is under 2%
- Zero customer complaints caused by the AI
- Escalations are firing correctly on the acceptance-test scenarios that
  actually occurred in real traffic

## Weeks 3-4 — Selective automation

Per the brief: "After it completes perhaps 100 interactions with a very low
error rate, selectively allow routine actions to run automatically." Candidates,
in order of how low-risk they are:
1. Appointment reminders (low risk, high value — never contains a price or
   commitment beyond what's already confirmed)
2. Completion follow-up + review requests
3. Initial acknowledgment (still logged, still auditable, still template-only)

Never auto-send: anything touching price, scheduling *confirmation* (vs.
offering windows), or any message on a job flagged `needs_human_review`.

## Day 30 — Pilot review

Evaluate against Initial Performance Targets (see `metrics.md`) and the
economic test:

**Total monthly system cost ÷ incremental completed jobs**

If that number is favorable against the contribution margin per job, extend
the pilot and widen scope. If not, the fix is scope or process, not more
automation — re-read the job description's warning against building a
general-purpose "AI employee."
