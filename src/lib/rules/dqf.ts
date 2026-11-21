export const DOC_TYPES = [
  'medical',
  'mvr',
  'cdl',
  'annual_review',
  'road_test',
  'employment_verification',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type RuleDocType = DocType | 'random_testing';

export type RulePeriod =
  | { kind: 'months'; months: number }
  | { kind: 'certificate' }
  | { kind: 'one_time' }
  | { kind: 'not_tracked' };

export type DateAnchor =
  | 'issuedOn'
  | 'expiresOn'
  | 'lastPulledOn'
  | 'completedOn'
  | 'verifiedOn';

export interface DqfRule {
  id: string;
  docType: RuleDocType;
  label: string;
  citation: string;
  period: RulePeriod;
  periodLabel: string;
  anchor: DateAnchor | null;
  recurring: boolean;
  cdlOnly: boolean;
  inputMode: 'issue_and_expiry' | 'single_date' | 'expiry_only' | 'none';
  note: string;
}

export const DQF_RULES: DqfRule[] = [
  {
    id: 'medical_certificate',
    docType: 'medical',
    label: "Medical examiner's certificate",
    citation: '49 CFR 391.45(b)',
    period: { kind: 'months', months: 24 },
    periodLabel: '24 months (certificate expiry first)',
    anchor: 'expiresOn',
    recurring: true,
    cdlOnly: false,
    inputMode: 'issue_and_expiry',
    note:
      'Uses the expiration date printed on the certificate when you provide it. If only the issue date is known, the tracker estimates issue date + 24 months and marks the result as estimated.',
  },
  {
    id: 'mvr',
    docType: 'mvr',
    label: 'Motor vehicle record (MVR)',
    citation: '49 CFR 391.25(c)(2)',
    period: { kind: 'months', months: 12 },
    periodLabel: '12 months',
    anchor: 'lastPulledOn',
    recurring: true,
    cdlOnly: false,
    inputMode: 'single_date',
    note: 'The next MVR pull is estimated at 12 months after the last pull date you enter.',
  },
  {
    id: 'cdl',
    docType: 'cdl',
    label: 'CDL expiration',
    citation: '49 CFR Part 383',
    period: { kind: 'certificate' },
    periodLabel: 'Certificate expiry (state-issued)',
    anchor: 'expiresOn',
    recurring: true,
    cdlOnly: true,
    inputMode: 'expiry_only',
    note:
      'CDL validity is set by the issuing state. The tracker uses only the expiration date you enter and does not assume a fixed federal cycle.',
  },
  {
    id: 'annual_review',
    docType: 'annual_review',
    label: 'Annual review of driving record',
    citation: '49 CFR 391.25(a)',
    period: { kind: 'months', months: 12 },
    periodLabel: '12 months',
    anchor: 'completedOn',
    recurring: true,
    cdlOnly: false,
    inputMode: 'single_date',
    note: 'The next annual review is estimated at 12 months after the review date you enter.',
  },
  {
    id: 'road_test',
    docType: 'road_test',
    label: 'Road test',
    citation: '49 CFR 391.31',
    period: { kind: 'one_time' },
    periodLabel: 'One-time document',
    anchor: 'completedOn',
    recurring: false,
    cdlOnly: false,
    inputMode: 'single_date',
    note: 'A road test certificate is a one-time document. The tracker shows whether it is on file and does not calculate a recurring due date.',
  },
  {
    id: 'employment_verification',
    docType: 'employment_verification',
    label: 'Employment verification',
    citation: '49 CFR 391.51(b)(2)',
    period: { kind: 'one_time' },
    periodLabel: 'One-time document',
    anchor: 'verifiedOn',
    recurring: false,
    cdlOnly: false,
    inputMode: 'single_date',
    note:
      'Employment verification is a one-time document. The tracker shows whether it is on file and does not calculate a recurring due date.',
  },
  {
    id: 'random_testing',
    docType: 'random_testing',
    label: 'Drug & alcohol random testing',
    citation: '49 CFR Part 382',
    period: { kind: 'not_tracked' },
    periodLabel: 'Program-level requirement',
    anchor: null,
    recurring: false,
    cdlOnly: false,
    inputMode: 'none',
    note:
      'Random testing is a program-level requirement and does not have a single expiration date. It is listed for reference only and is not part of the date inputs or calculations.',
  },
];

export const DQF_RULES_BY_ID: Record<string, DqfRule> = Object.fromEntries(
  DQF_RULES.map((rule) => [rule.id, rule]),
);

export const INPUT_RULES: DqfRule[] = DQF_RULES.filter((rule) => rule.inputMode !== 'none');

export function rulesForDriver(isCdlDriver: boolean): DqfRule[] {
  return DQF_RULES.filter((rule) => !rule.cdlOnly || isCdlDriver);
}
