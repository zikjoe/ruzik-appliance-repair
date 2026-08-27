export type Channel = 'website' | 'sms' | 'missed_call';

/** The full lead-intake field set from job description § 1 Lead Intake. */
export interface IntakeFields {
  fullName?: string;
  address?: string;
  zip?: string;
  phone?: string;
  email?: string;
  serviceType?: string; // Repair | Installation
  appliance?: string;
  brand?: string;
  model?: string;
  problemDescription?: string;
  hasMedia?: boolean;
  preferredWindows?: string[];
  propertyType?: string;
  accessInstructions?: string;
  referralSource?: string;
  urgent?: boolean;
}

export const REQUIRED_FIELDS: (keyof IntakeFields)[] = [
  'fullName',
  'address',
  'zip',
  'phone',
  'appliance',
  'problemDescription',
];

export function missingRequiredFields(fields: IntakeFields): (keyof IntakeFields)[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = fields[f];
    return v === undefined || v === null || v === '';
  });
}
