# Runbook

## Pause switch (stop all AI-initiated outbound activity instantly)

```
curl -X POST https://<your-host>/admin/pause -H "x-admin-token: $ADMIN_TOKEN"
```

Effect, immediately:
- No outbound message can move past `pending_approval` (`checkAction` blocks
  every action kind except `collect_customer_info` — see
  `src/guardrails/index.ts`).
- Job/customer records are still created and safety hazards are still
  detected and escalated (never suppress a safety response).
- Nothing is deleted; resume with:

```
curl -X POST https://<your-host>/admin/resume -H "x-admin-token: $ADMIN_TOKEN"
```

## Manual human takeover

1. Check `GET /admin/approvals` for anything waiting.
2. Check `GET /admin/jobs/:id` for the full thread on a specific job
   (messages + escalations + job record in one call).
3. Handle the customer directly (phone/text). There's no requirement to log
   the manual conversation back into the system for the pilot, but doing so
   (`POST /webhooks/inbound-message`) keeps the job's history complete for
   later.
4. Resolve the escalation: `POST /admin/escalations/:id/resolve`.

## Backup / data export

```
curl https://<your-host>/admin/export -H "x-admin-token: $ADMIN_TOKEN" > backup-$(date +%F).json
```

Also back up the raw SQLite file directly (`data/coordinator.db` by default,
or `$COORDINATOR_DB_PATH`) — it's a single file, trivial to copy/version.
Do this on a schedule (e.g. daily cron) once live; nothing in this repo
automates that yet.

## "I'm not getting owner alerts"

Every alert attempt is audit-logged regardless of outcome — check
`GET /admin/export` (or query `audit_log` directly) for `alert_email_sent`/
`alert_email_skipped`/`alert_email_failed` and the `alert_sms_*` equivalents.
`_skipped` means the SMTP/Twilio env vars aren't set yet (expected until
go-live — see `docs/go-live-checklist.md`); `_failed` means credentials are
set but the send itself errored (check the `detail` column). Alerts never
block or fail the underlying job/escalation/message action either way — see
`src/notify/index.ts`.

## Spending cap tripped

If `config/spending-limits.json`'s `dailyClaudeApiCallCap` is hit,
`src/lib/claude.ts` refuses further model calls for the rest of the day
(`SpendingCapExceededError`) rather than degrading silently. The SMS/
missed-call channel falls back to phone-only field collection when this
happens (see `handleFreeTextInquiry`'s catch block) — customers still get a
response, just without AI-assisted field extraction. Raise the cap in the
config file once you understand why it was hit.
