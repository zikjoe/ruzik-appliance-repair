import { callClaude } from '../lib/claude.js';
import { priceList } from '../lib/config.js';
import type { IntakeFields } from '../lib/types.js';

const APPLIANCE_KEYS = Object.keys(priceList.services);

const SYSTEM_PROMPT = `You extract structured lead-intake fields from a customer's SMS message to an
appliance repair company. Output ONLY a single JSON object, no prose, no markdown fences.

Fields (all optional — omit any field you cannot confidently extract, do not guess):
fullName, address, zip, phone, email, serviceType ("Repair" or "Installation"),
appliance (one of: ${APPLIANCE_KEYS.join(', ')}), brand, model, problemDescription,
preferredWindows (array of strings), propertyType, accessInstructions, urgent (boolean).

Rules:
- Never invent a value that isn't stated or clearly implied in the message.
- "urgent" means the customer used words implying urgency (e.g. "asap", "today", "emergency") —
  it is NOT for safety hazards (gas/fire/flood/electrical), those are handled by a separate
  system before your output is even used, so do not try to detect them.
- problemDescription should be a concise paraphrase of what the customer described, not a copy
  of the whole message.`;

/** Used for the SMS / missed-call-text-back channels, where inbound text is
 * unstructured (unlike the website form, which already has named fields).
 * Returns a best-effort partial IntakeFields — callers must still run
 * missingRequiredFields() and ask follow-up questions for what's left. */
export async function parseFreeText(text: string, jobId?: number): Promise<IntakeFields> {
  const raw = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: text,
    maxTokens: 512,
    jobId,
  });
  try {
    const parsed = JSON.parse(raw);
    return parsed as IntakeFields;
  } catch {
    // Model didn't return clean JSON — fail safe to "nothing extracted" rather
    // than crash the intake flow; the caller will see everything as missing
    // and ask the customer directly.
    return {};
  }
}
