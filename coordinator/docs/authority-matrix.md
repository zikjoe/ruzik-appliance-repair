# Authority Matrix

Source of truth: `config/escalation-triggers.json` (triggers) and
`src/guardrails/index.ts` (`ALLOWED_ACTION_KINDS` / `FORBIDDEN_ACTION_KINDS` —
enforced in code, not just documented here).

## The AI may do, without asking first

| Action | Where enforced |
|---|---|
| Answer approved FAQs | `src/messaging` templates only |
| Collect customer information | `src/intake` |
| Create and update job records | `src/intake/createJob.ts`, `src/qualify` |
| Draft approved-template messages | `src/messaging/draftTemplateMessage` (still requires owner approval to *send*, see Copilot Mode below) |
| Offer approved appointment windows | `src/scheduling/offerApprovedWindows` — windows come only from `config/appointment-windows.json` |
| Send reminders and follow-ups | Same template gate as above |
| Recommend a technician assignment | `src/scheduling/recommendTechnician` — a recommendation, not a confirmed booking |

## The AI may never do, full stop (structurally blocked, not just prompted against)

`FORBIDDEN_ACTION_KINDS` in `src/guardrails/index.ts` — `checkAction()` refuses
these unconditionally, there is no config flag that turns them on:

- Diagnose an appliance / guarantee a repair outcome
- Create an unapproved price or discount
- Approve a refund or credit
- Make a payment or pay a contractor
- Purchase parts
- Change contractor compensation
- Settle a dispute
- Admit legal liability
- Threaten collections activity
- Handle an emergency directly (it may only give the fixed safety redirect
  and escalate — see `SAFETY_REDIRECT_MESSAGE`)
- Delete a customer or financial record
- Send mass marketing
- Publish social media content
- Confirm an exception without owner approval

## Mandatory human escalation

Every trigger below creates a row in the `escalations` table (never silent)
and flips the job to `needs_human`:

| Trigger key | Meaning |
|---|---|
| `safety_hazard` | Gas, fire/smoke, electrical, flooding, or injury language detected — checked **before** any AI-drafted reply, on every inbound message, every channel |
| `angry_or_threatening` | Customer is angry, threatening, or requesting a refund |
| `charge_dispute` | Customer disputes a charge |
| `price_outside_list` | Required price falls outside `config/price-list.json` |
| `technician_payment_request` | A technician asks for additional payment |
| `ai_uncertain` | Qualification failed (out of area, unsupported appliance, no published price) or extraction failed |
| `repeated_failure` | The same action failed twice |
| `warranty_callback` | Customer reports the same problem recurring |
| `high_value_or_commercial` | Commercial or unusually high-value job |
| `legal_insurance_employment_tax_licensing` | Request touches legal/insurance/employment/tax/licensing |
| `prompt_injection_suspected` | Message attempts to override instructions or impersonate the owner |
| `cancellation` | Customer wants to cancel |
| `late_arrival` | Technician reported late or a no-show |
| `scheduling_conflict` | Double-booking or no compatible window |
| `unaccepted_assignment` | Technician did not accept a recommended assignment |

## Copilot mode (pilot default)

Every outbound message (except the fixed, non-negotiable safety redirect) is
created with `status = 'pending_approval'` and never auto-sends —
`src/messaging/draftTemplateMessage`. An explicit owner call to
`POST /admin/messages/:id/approve` is what actually sends it
(`src/messaging/approveAndSend`). See `pilot-plan.md` for when/how this
graduates to selective automation.

## Bot disclosure

If a customer directly asks whether they're talking to a person or an AI,
the response is the fixed text in `src/messaging/disclosureMessage()` — not
model-generated, cannot be prompted away. See `isAskingIfBot()`.
