import type { NetlifyFormPayload } from '../../src/intake/parseWebsiteForm.js';

let counter = 0;
/** Each call gets a fresh phone number so unrelated scenarios in the same
 * test file don't accidentally trip the dedup logic (tests share one SQLite
 * file per test file — see test/setup.ts). Pass the same phone twice on
 * purpose to test dedup itself. */
export function uniquePhone(): string {
  counter += 1;
  return `404555${String(1000 + counter).padStart(4, '0')}`;
}

export function makeWebsitePayload(overrides: Partial<NetlifyFormPayload['data']> = {}): NetlifyFormPayload {
  return {
    data: {
      name: 'Jane Smith',
      phone: uniquePhone(),
      email: `jane.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,
      'service-type': 'Repair',
      appliance: 'dryer',
      brand: 'LG',
      model: 'DLEX3700V',
      message: 'Dryer runs but does not heat up at all.',
      zip: '30301',
      'preferred-time': 'Morning (8 AM - 12 PM)',
      ...overrides,
    },
  };
}
