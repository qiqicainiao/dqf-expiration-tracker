import { z } from 'zod';
import { DOC_TYPES, type DocType } from '../rules/dqf';
import { addDays, formatDateOnly, isValidDateOnly, parseDateOnly, todayDateOnly } from '../calc/date';

export type { DocType } from '../rules/dqf';

export const SITE_ID = 'dqf-tracker' as const;
export const SCHEMA_VERSION = 1 as const;

export interface DocumentDates {
  uuid: string;
  timestamp: string;
  schemaVersion: 1;
  siteId: typeof SITE_ID;
  type: DocType;
  issuedOn?: string;
  expiresOn?: string;
  lastPulledOn?: string;
  completedOn?: string;
  verifiedOn?: string;
}

export interface DriverRecord {
  uuid: string;
  timestamp: string;
  schemaVersion: 1;
  siteId: typeof SITE_ID;
  label: string;
  isCdlDriver: boolean;
  documents: Partial<Record<DocType, DocumentDates>>;
}

export interface TrackerStoreV1 {
  schemaVersion: 1;
  siteId: typeof SITE_ID;
  updatedAt: string;
  rulesVersion: string;
  drivers: DriverRecord[];
  meta?: {
    lastSavedAt: string;
    source: 'manual' | 'url_prefill' | 'import';
  };
}

const dateOnlyField = z
  .string()
  .refine(isValidDateOnly, 'Enter a valid date in YYYY-MM-DD format.');

const optionalDateField = z
  .string()
  .optional()
  .refine(
    (value) => value === undefined || value === '' || isValidDateOnly(value),
    'Enter a valid date in YYYY-MM-DD format.',
  );

export const DocumentDatesSchema = z.object({
  uuid: z.string().min(1),
  timestamp: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  siteId: z.literal(SITE_ID),
  type: z.enum(DOC_TYPES),
  issuedOn: dateOnlyField.optional(),
  expiresOn: dateOnlyField.optional(),
  lastPulledOn: dateOnlyField.optional(),
  completedOn: dateOnlyField.optional(),
  verifiedOn: dateOnlyField.optional(),
});

export const DriverRecordSchema = z.object({
  uuid: z.string().min(1),
  timestamp: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  siteId: z.literal(SITE_ID),
  label: z.string().max(30),
  isCdlDriver: z.boolean(),
  documents: z.object({
    medical: DocumentDatesSchema.optional(),
    mvr: DocumentDatesSchema.optional(),
    cdl: DocumentDatesSchema.optional(),
    annual_review: DocumentDatesSchema.optional(),
    road_test: DocumentDatesSchema.optional(),
    employment_verification: DocumentDatesSchema.optional(),
  }),
});

export const TrackerStoreSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  siteId: z.literal(SITE_ID),
  updatedAt: z.string().min(1),
  rulesVersion: z.string().min(1),
  drivers: z.array(DriverRecordSchema).max(5, 'You can track up to 5 drivers.'),
  meta: z
    .object({
      lastSavedAt: z.string().min(1),
      source: z.enum(['manual', 'url_prefill', 'import']),
    })
    .optional(),
});

export const DriverFormSchema = z
  .object({
    label: z.string().trim().max(30, 'Keep it under 30 characters.'),
    isCdlDriver: z.boolean(),
    documents: z.object({
      medical: z.object({
        issuedOn: optionalDateField,
        expiresOn: optionalDateField,
      }),
      mvr: z.object({ lastPulledOn: optionalDateField }),
      cdl: z.object({ expiresOn: optionalDateField }),
      annual_review: z.object({ completedOn: optionalDateField }),
      road_test: z.object({ completedOn: optionalDateField }),
      employment_verification: z.object({ verifiedOn: optionalDateField }),
    }),
  })
  .superRefine((values, ctx) => {
    const today = todayDateOnly();
    const tomorrow = formatDateOnly(addDays(parseDateOnly(today), 1));
    const { medical, mvr, cdl, annual_review, road_test, employment_verification } =
      values.documents;

    const rejectFuture = (value: string | undefined, path: (string | number)[]) => {
      if (value && value > tomorrow) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: "This date can't be in the future.",
        });
      }
    };

    rejectFuture(medical.issuedOn, ['documents', 'medical', 'issuedOn']);
    rejectFuture(mvr.lastPulledOn, ['documents', 'mvr', 'lastPulledOn']);
    rejectFuture(annual_review.completedOn, ['documents', 'annual_review', 'completedOn']);
    rejectFuture(road_test.completedOn, ['documents', 'road_test', 'completedOn']);
    rejectFuture(
      employment_verification.verifiedOn,
      ['documents', 'employment_verification', 'verifiedOn'],
    );

    if (medical.issuedOn && medical.expiresOn && medical.expiresOn <= medical.issuedOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents', 'medical', 'expiresOn'],
        message: 'Expiration date must be after the issue date.',
      });
    }

    const trackedDates = [
      medical.issuedOn,
      medical.expiresOn,
      mvr.lastPulledOn,
      annual_review.completedOn,
      road_test.completedOn,
      employment_verification.verifiedOn,
      values.isCdlDriver ? cdl.expiresOn : undefined,
    ].filter((value): value is string => Boolean(value));

    if (trackedDates.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents'],
        message: 'Add at least one date for this driver.',
      });
    }
  });

export type DriverFormValues = z.infer<typeof DriverFormSchema>;

let uuidCounter = 0;

export function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  uuidCounter += 1;
  const random = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${random()}-${random()}-${uuidCounter.toString(16)}`;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function hasUnsafeKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafeKeys(item));
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) return true;
      if (hasUnsafeKeys((value as Record<string, unknown>)[key])) return true;
    }
  }
  return false;
}

function buildDocument(
  type: DocType,
  dates: Omit<DocumentDates, 'uuid' | 'timestamp' | 'schemaVersion' | 'siteId' | 'type'>,
  existing?: DocumentDates,
): DocumentDates | undefined {

  const cleanDates = Object.fromEntries(
    Object.entries(dates).map(([key, value]) => [
      key,
      typeof value === 'string' && isValidDateOnly(value) ? value : undefined,
    ]),
  ) as typeof dates;
  const hasDate = Object.values(cleanDates).some((value) => Boolean(value));
  if (!hasDate) return undefined;
  return {
    uuid: existing?.uuid ?? createUuid(),
    timestamp: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    siteId: SITE_ID,
    type,
    ...cleanDates,
  };
}

export function driverFromForm(
  values: DriverFormValues,
  existing?: DriverRecord,
  source: DriverRecord['documents'] = existing?.documents ?? {},
): DriverRecord {
  const now = new Date().toISOString();
  const documents: Partial<Record<DocType, DocumentDates>> = {};

  const medical = buildDocument(
    'medical',
    {
      issuedOn: values.documents.medical.issuedOn || undefined,
      expiresOn: values.documents.medical.expiresOn || undefined,
    },
    source.medical,
  );
  if (medical) documents.medical = medical;

  const mvr = buildDocument(
    'mvr',
    { lastPulledOn: values.documents.mvr.lastPulledOn || undefined },
    source.mvr,
  );
  if (mvr) documents.mvr = mvr;

  const cdl = buildDocument(
    'cdl',
    { expiresOn: values.documents.cdl.expiresOn || undefined },
    source.cdl,
  );
  if (cdl) documents.cdl = cdl;

  const annual = buildDocument(
    'annual_review',
    { completedOn: values.documents.annual_review.completedOn || undefined },
    source.annual_review,
  );
  if (annual) documents.annual_review = annual;

  const road = buildDocument(
    'road_test',
    { completedOn: values.documents.road_test.completedOn || undefined },
    source.road_test,
  );
  if (road) documents.road_test = road;

  const employment = buildDocument(
    'employment_verification',
    { verifiedOn: values.documents.employment_verification.verifiedOn || undefined },
    source.employment_verification,
  );
  if (employment) documents.employment_verification = employment;

  return {
    uuid: existing?.uuid ?? createUuid(),
    timestamp: now,
    schemaVersion: SCHEMA_VERSION,
    siteId: SITE_ID,
    label: values.label.trim(),
    isCdlDriver: values.isCdlDriver,
    documents,
  };
}

export function driverToFormValues(driver: DriverRecord): DriverFormValues {
  return {
    label: driver.label,
    isCdlDriver: driver.isCdlDriver,
    documents: {
      medical: {
        issuedOn: driver.documents.medical?.issuedOn ?? '',
        expiresOn: driver.documents.medical?.expiresOn ?? '',
      },
      mvr: { lastPulledOn: driver.documents.mvr?.lastPulledOn ?? '' },
      cdl: { expiresOn: driver.documents.cdl?.expiresOn ?? '' },
      annual_review: { completedOn: driver.documents.annual_review?.completedOn ?? '' },
      road_test: { completedOn: driver.documents.road_test?.completedOn ?? '' },
      employment_verification: {
        verifiedOn: driver.documents.employment_verification?.verifiedOn ?? '',
      },
    },
  };
}
