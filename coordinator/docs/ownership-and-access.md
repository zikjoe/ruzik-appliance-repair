# Ownership & Access — Fill This In Before Going Live

These are real business decisions, not something the codebase can answer for
you. This file ships as a template on purpose — treat it as the checklist
from "the deal you should make" and fill in actual answers (with whoever
ends up hosting/maintaining this, if not solely you).

| Question | Answer |
|---|---|
| Who pays for hosting? | ☐ TBD |
| Who pays for SMS/texting (Twilio)? | ☐ TBD |
| Who pays for the Claude API usage? | ☐ TBD |
| Who pays for the database (if moved off free-tier SQLite-on-a-VM later)? | ☐ TBD |
| Who owns the source code and workflows? | This repo, `ruzik-appliance-repair`, under Ruzik's GitHub account — confirm the account owner |
| Who owns the GitHub repo itself? | ☐ TBD (confirm account) |
| What happens if the person maintaining this becomes unavailable? | ☐ TBD — the code, schema, and docs are self-contained specifically so a new maintainer can pick this up; confirm someone besides the original builder has repo access |
| Can Isaac export all customer and job data himself, without asking anyone? | Yes today — `GET /admin/export` requires only the `ADMIN_TOKEN` Isaac controls. Confirm Isaac actually holds that token. |
| Who fixes failures or security problems, and on what timeline? | ☐ TBD |
| Is there a monthly usage cap and automatic shutoff? | Yes in code — `config/spending-limits.json` (`dailyClaudeApiCostHardCapUsd`, `onHardCapExceeded: "pause_ai_and_escalate"`). Confirm the dollar values match what Isaac actually wants to risk. |
| Will customer data be retained or used to train anything? | ☐ TBD — nothing in this codebase sends customer data anywhere except the Anthropic API for drafting/extraction. Confirm Anthropic's data-retention terms for the API tier in use, and state Ruzik's own retention policy here. |
| What level of support is included, and for how long? | ☐ TBD |
| Who has admin access (the `ADMIN_TOKEN`)? | ☐ TBD — rotate it before sharing this repo further; treat it as a password, never commit it |

## Minimum-access principle (already implemented)

- `/admin/*` routes require `ADMIN_TOKEN` (see `src/server.ts`).
- Credentials live in `.env`, never in source — `.env` is gitignored,
  `.env.example` documents what's needed without values.
- The SQLite database is a single file the owner fully controls — no
  third-party has access to it by default.
