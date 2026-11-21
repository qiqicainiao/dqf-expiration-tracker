import {
  addMonths,
  diffDays,
  formatDateOnly,
  parseDateOnly,
} from './date';
import { DQF_RULES, DQF_RULES_BY_ID, type DqfRule } from '../rules/dqf';
import type { DriverRecord } from '../storage/schema';

export type ExpiryStatus = 'overdue' | 'due_30' | 'due_60' | 'ok' | 'unknown' | 'one_time';

export interface ExpiryItem {
  ruleId: string;
  docType: DqfRule['docType'];
  label: string;
  dueOn: string | null;
  status: ExpiryStatus;
  daysRemaining: number | null;
  estimated: boolean;
  citation: string;
  hasInput: boolean;
  recurring: boolean;
  periodLabel: string;
  note: string;
}

export function statusForDays(daysRemaining: number): ExpiryStatus {
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 30) return 'due_30';
  if (daysRemaining <= 60) return 'due_60';
  return 'ok';
}

const RULE_ORDER = new Map(DQF_RULES.map((rule, index) => [rule.id, index]));

function emptyItem(rule: DqfRule): ExpiryItem {
  return {
    ruleId: rule.id,
    docType: rule.docType,
    label: rule.label,
    dueOn: null,
    status: 'unknown',
    daysRemaining: null,
    estimated: false,
    citation: rule.citation,
    hasInput: false,
    recurring: rule.recurring,
    periodLabel: rule.periodLabel,
    note: rule.note,
  };
}

export function computeDriverExpiries(driver: DriverRecord, today: string): ExpiryItem[] {
  const todayDate = parseDateOnly(today);

  return DQF_RULES.filter((rule) => !rule.cdlOnly || driver.isCdlDriver)
    .filter((rule) => rule.period.kind !== 'not_tracked')
    .map((rule) => {
      const base = emptyItem(rule);
      const doc = rule.docType === 'random_testing' ? undefined : driver.documents[rule.docType];

      if (rule.period.kind === 'one_time') {
        const anchorValue = rule.anchor ? doc?.[rule.anchor] : undefined;
        if (anchorValue) {
          return {
            ...base,
            hasInput: true,
            status: 'one_time' as const,
            dueOn: null,
            daysRemaining: null,
          };
        }
        return base;
      }

      let dueOn: string | null = null;
      let estimated = false;

      if (rule.period.kind === 'certificate') {
        dueOn = doc?.expiresOn ?? null;
      } else if (rule.period.kind === 'months') {
        if (rule.id === 'medical_certificate' && doc?.expiresOn) {

          dueOn = doc.expiresOn;
        } else if (rule.id === 'medical_certificate' && doc?.issuedOn) {

          dueOn = formatDateOnly(addMonths(parseDateOnly(doc.issuedOn), rule.period.months));
          estimated = true;
        } else {
          const anchorValue = rule.anchor ? doc?.[rule.anchor] : undefined;
          if (anchorValue) {
            dueOn = formatDateOnly(addMonths(parseDateOnly(anchorValue), rule.period.months));
          }
        }
      }

      if (!dueOn) {
        return base;
      }

      const daysRemaining = diffDays(todayDate, parseDateOnly(dueOn));
      return {
        ...base,
        dueOn,
        status: statusForDays(daysRemaining),
        daysRemaining,
        estimated,
        hasInput: true,
      };
    });
}

export function nextDueItem(items: ExpiryItem[]): ExpiryItem | null {
  const candidates = items.filter((item) => item.recurring && item.dueOn !== null);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const byDate = (a.dueOn as string).localeCompare(b.dueOn as string);
    if (byDate !== 0) return byDate;
    return (RULE_ORDER.get(a.ruleId) ?? 0) - (RULE_ORDER.get(b.ruleId) ?? 0);
  })[0];
}

export interface FleetEntry {
  driverId: string;
  driverLabel: string;
  item: ExpiryItem;
}

export function fleetTopEntries(
  drivers: DriverRecord[],
  today: string,
  limit = 3,
): FleetEntry[] {
  const entries: FleetEntry[] = [];
  for (const driver of drivers) {
    const items = computeDriverExpiries(driver, today);
    for (const item of items) {
      if (!item.recurring || item.dueOn === null || item.daysRemaining === null) continue;
      entries.push({
        driverId: driver.uuid,
        driverLabel: driver.label,
        item,
      });
    }
  }

  return entries
    .sort((a, b) => {
      const byDays = (a.item.daysRemaining as number) - (b.item.daysRemaining as number);
      if (byDays !== 0) return byDays;
      const byDate = (a.item.dueOn as string).localeCompare(b.item.dueOn as string);
      if (byDate !== 0) return byDate;
      return (RULE_ORDER.get(a.item.ruleId) ?? 0) - (RULE_ORDER.get(b.item.ruleId) ?? 0);
    })
    .slice(0, limit);
}

export function countMissingInputs(items: ExpiryItem[]): number {
  return items.filter((item) => !item.hasInput).length;
}

export function ruleById(ruleId: string): DqfRule | undefined {
  return DQF_RULES_BY_ID[ruleId];
}
