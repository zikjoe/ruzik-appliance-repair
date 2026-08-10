# Go-Live Checklist

Everything below is a **config/dashboard step**, not a code change — the
code already speaks the real payload shapes.

## 1. Website inquiries (channel already built)

In the Netlify dashboard for this site: **Site settings → Forms →
Notifications → Add notification → Outgoing webhook**, form = the existing
`service-request` form, URL = `https://<your-host>/webhooks/website`.
No change to `contact.html` or `assets/js/form.js` needed — they already
work exactly as before; this just adds a second recipient for the same
submission.

## 2. SMS + missed-call text-back

1. Provision a Twilio number.
2. Point its "A message comes in" webhook at a small adapter endpoint that
   translates Twilio's `From`/`Body` fields into this app's
   `POST /webhooks/sms` shape (`{ phone, text, channel: "sms" }`). Twilio's
   inbound webhook isn't wired directly to avoid coupling the core logic to
   one SMS vendor.
3. For missed-call text-back specifically: configure the Twilio number's
   voice webhook to auto-decline/forward-to-voicemail, then fire a text via
   the Twilio Studio/Functions flow calling the same `/webhooks/sms` endpoint
   with `channel: "missed_call"`.

## 3. Credentials

- Set `ANTHROPIC_API_KEY` (production key, with its own budget alert
  configured in the Anthropic console — separate from `config/spending-limits.json`,
  which is this app's own internal cap).
- Set `ADMIN_TOKEN` to a freshly generated secret (`openssl rand -hex 32`).
- Confirm `.env` is not committed (`.gitignore` already covers it).

## 4. Hosting

- SQLite needs a persistent filesystem — a small always-on VM/container
  (not a serverless function with an ephemeral disk).
- Set `COORDINATOR_DB_PATH` to a path on a persistent volume if not using
  the default `data/coordinator.db`.
- Put a reverse proxy (Caddy/nginx) in front for TLS.

## 5. Before the first real customer

- [ ] `npm test` passes (all acceptance scenarios).
- [ ] `docs/ownership-and-access.md` filled in.
- [ ] `config/*.json` reviewed for accuracy (prices, ZIPs, templates).
- [ ] A daily backup of the SQLite file is scheduled (see `runbook.md`).
- [ ] Isaac has bookmarked `/admin/approvals` and knows the pause-switch
      command.
