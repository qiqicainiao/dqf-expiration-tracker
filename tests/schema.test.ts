// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DriverFormSchema,
  driverFromForm,
  type DriverFormValues,
} from '../src/lib/storage/schema';
import {
  addDays,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from '../src/lib/calc/date';

function formValues(overrides: Partial<DriverFormValues['documents']> = {}): DriverFormValues {
  return {
    label: '',
    isCdlDriver: true,
    documents: {
      medical: { issuedOn: '', expiresOn: '' },
      mvr: { lastPulledOn: '' },
      cdl: { expiresOn: '' },
      annual_review: { completedOn: '' },
      road_test: { completedOn: '' },
      employment_verification: { verifiedOn: '' },
      ...overrides,
    },
  };
}

function messages(values: DriverFormValues): string[] {
  const result = DriverFormSchema.safeParse(values);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe('driver form validation', () => {
  it('requires at least one date', () => {
    expect(messages(formValues())).toContain('Add at least one date for this driver.');
  });

  it('accepts a driver with one recurring date', () => {
    const result = DriverFormSchema.safeParse(
      formValues({ mvr: { lastPulledOn: '2025-01-01' } }),
    );
    expect(result.success).toBe(true);
  });

  it('requires the medical expiration date to be after the issue date', () => {
    const result = DriverFormSchema.safeParse(
      formValues({ medical: { issuedOn: '2026-01-10', expiresOn: '2026-01-10' } }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Expiration date must be after the issue date.',
      );
    }
  });

  it('rejects issue and completion dates two days in the future', () => {
    const future = formatDateOnly(addDays(parseDateOnly(todayDateOnly()), 2));
    const errors = messages(formValues({ mvr: { lastPulledOn: future } }));
    expect(errors).toContain("This date can't be in the future.");
  });

  it('allows the +1 day time-zone tolerance', () => {
    const tomorrow = formatDateOnly(addDays(parseDateOnly(todayDateOnly()), 1));
    const result = DriverFormSchema.safeParse(
      formValues({ annual_review: { completedOn: tomorrow } }),
    );
    expect(result.success).toBe(true);
  });

  it('allows an expiration date in the past', () => {
    const result = DriverFormSchema.safeParse(
      formValues({ medical: { issuedOn: '2019-01-01', expiresOn: '2020-01-01' } }),
    );
    expect(result.success).toBe(true);
  });

  it('does not count a CDL date when the CDL switch is off', () => {
    const values = formValues({ cdl: { expiresOn: '2026-12-01' } });
    values.isCdlDriver = false;
    expect(messages(values)).toContain('Add at least one date for this driver.');
  });
});

describe('driverFromForm normalization', () => {
  it('drops empty documents and keeps the CDL date while the switch is off', () => {
    const values = formValues({
      medical: { issuedOn: '', expiresOn: '2027-01-01' },
      cdl: { expiresOn: '2028-03-15' },
    });
    values.isCdlDriver = false;
    values.label = '  Test Driver  ';

    const driver = driverFromForm(values);
    expect(driver.label).toBe('Test Driver');
    expect(driver.documents.medical?.expiresOn).toBe('2027-01-01');
    expect(driver.documents.cdl?.expiresOn).toBe('2028-03-15');
    expect(driver.documents.mvr).toBeUndefined();
    expect(driver.documents.road_test).toBeUndefined();
  });

  it('drops invalid date strings before persistence', () => {
    const values = formValues({
      medical: { issuedOn: 'not-a-date', expiresOn: '2027-01-01' },
      mvr: { lastPulledOn: '2026-13-40' },
    });

    const driver = driverFromForm(values);
    expect(driver.documents.medical?.issuedOn).toBeUndefined();
    expect(driver.documents.medical?.expiresOn).toBe('2027-01-01');
    expect(driver.documents.mvr).toBeUndefined();
  });
});
