import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, '../../config');

function loadJson<T>(filename: string): T {
  const raw = readFileSync(path.join(CONFIG_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

export interface BusinessConfig {
  companyName: string;
  owner: string;
  phone: string;
  email: string;
  hours: Record<string, string>;
  responseTimeTargetMinutes: number;
  timezone: string;
}

export interface ServiceAreaConfig {
  counties: string[];
  zips: string[];
}

export interface PriceListConfig {
  diagnosticFeeNote: string;
  services: Record<
    string,
    { label: string; estimateLowCents: number | null; estimateHighCents: number | null; note?: string }
  >;
  brandsServiced: string[];
}

export interface EscalationTriggersConfig {
  safetyKeywords: Record<string, string[]>;
  escalationTriggers: { key: string; description: string }[];
}

export interface MessageTemplatesConfig {
  templates: Record<string, { vars: string[]; body: string }>;
  disclosureRule: string;
}

export interface SpendingLimitsConfig {
  dailyClaudeApiCallCap: number;
  dailyClaudeApiCostAlertUsd: number;
  dailyClaudeApiCostHardCapUsd: number;
  monthlyCostAlertUsd: number;
  alertRecipientEmail: string;
  onHardCapExceeded: string;
}

export interface AppointmentWindowsConfig {
  daily: { key: string; label: string }[];
  workingDays: string[];
  offerDaysAhead: number;
}

export interface NotificationsConfig {
  recipientEmail: string;
  recipientPhone: string;
  alertOn: { escalations: boolean; pendingApprovals: boolean };
}

export const business = loadJson<BusinessConfig>('business.json');
export const serviceArea = loadJson<ServiceAreaConfig>('service-area.json');
export const priceList = loadJson<PriceListConfig>('price-list.json');
export const escalationTriggers = loadJson<EscalationTriggersConfig>('escalation-triggers.json');
export const messageTemplates = loadJson<MessageTemplatesConfig>('message-templates.json');
export const spendingLimits = loadJson<SpendingLimitsConfig>('spending-limits.json');
export const appointmentWindows = loadJson<AppointmentWindowsConfig>('appointment-windows.json');
export const notifications = loadJson<NotificationsConfig>('notifications.json');
