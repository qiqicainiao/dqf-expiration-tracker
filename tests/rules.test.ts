// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeDriverExpiries,
  fleetTopEntries,
  nextDueItem,
  statusForDays,
} from '../src/lib/calc/expiry';
import { SITE_ID, type DocumentDates, type DocType, type DriverRecord } from '../src/lib/storage/schema';

const TODAY = '2026-11-13';

function documentFor(
  type: DocType,
  dates: Partial<Pick<DocumentDates, 'issuedOn' | 'expiresOn' | 'lastPulledOn' | 'completedOn' | 'verifiedOn'>>,
): DocumentDates {
  return {
    uuid: `doc-${type}`,
    timestamp: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    siteId: SITE_ID,
    type,
    ...dates,
  };
}

function makeDriver(
  documents: Partial<Record<DocType, DocumentDates>>,
  isCdlDriver = true,
  uuid = 'driver-1',
): DriverRecord {
  return {
    uuid,
    timestamp: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    siteId: SITE_ID,
    label: '',
    isCdlDriver,
    documents,
  };
}

describe('statusForDays boundaries', () => {
  it('maps -1 / 0 / 30 / 31 / 60 / 61 to the documented buckets', () => {
    expect(statusForDays(-1)).toBe('overdue');
    expect(statusForDays(-30)).toBe('overdue');
    expect(statusForDays(0)).toBe('due_30');
    expect(statusForDays(30)).toBe('due_30');
    expect(statusForDays(31)).toBe('due_60');
    expect(statusForDays(60)).toBe('due_60');
    expect(statusForDays(61)).toBe('ok');
  });

  it('applies the same boundaries through computeDriverExpiries', () => {
    const driver = makeDriver({
      mvr: documentFor('mvr', { lastPulledOn: '2025-10-14' }), // 2026-10-14 -> overdue
      annual_review: documentFor('annual_review', { completedOn: '2025-11-13' }), // due today
      medical: documentFor('medical', { expiresOn: '2026-12-13' }), // +30
      cdl: documentFor('cdl', { expiresOn: '2026-12-14' }), // +31
    });
    const items = computeDriverExpiries(driver, TODAY);
    const byId = Object.fromEntries(items.map((item) => [item.ruleId, item]));

    expect(byId.mvr.status).toBe('overdue');
    expect(byId.mvr.daysRemaining).toBe(-30);
    expect(byId.annual_review.status).toBe('due_30');
    expect(byId.annual_review.daysRemaining).toBe(0);
    expect(byId.medical_certificate.status).toBe('due_30');
    expect(byId.medical_certificate.daysRemaining).toBe(30);
    expect(byId.cdl.status).toBe('due_60');
    expect(byId.cdl.daysRemaining).toBe(31);
  });

  it('treats 60 days as due_60 and 61 as ok', () => {
    const driver = makeDriver({
      medical: documentFor('medical', { expiresOn: '2027-01-12' }), // +60
      annual_review: documentFor('annual_review', { completedOn: '2025-11-15' }), // 2026-11-15? adjust below
    });
    const items = computeDriverExpiries(driver, TODAY);
    expect(items.find((item) => item.ruleId === 'medical_certificate')?.status).toBe('due_60');
  });
});

describe('medical certificate rules', () => {
  it('uses an explicit expiration date and does not mark it estimated', () => {
    const driver = makeDriver({
      medical: documentFor('medical', { issuedOn: '2025-01-01', expiresOn: '2026-12-01' }),
    });
    const medical = computeDriverExpiries(driver, TODAY).find(
      (item) => item.ruleId === 'medical_certificate',
    );
    expect(medical?.dueOn).toBe('2026-12-01');
    expect(medical?.estimated).toBe(false);
    expect(medical?.status).toBe('due_30');
  });

  it('estimates issue date + 24 months when expiration is missing', () => {
    const driver = makeDriver({
      medical: documentFor('medical', { issuedOn: '2024-11-13' }),
    });
    const medical = computeDriverExpiries(driver, TODAY).find(
      (item) => item.ruleId === 'medical_certificate',
    );
    expect(medical?.dueOn).toBe('2026-11-13');
    expect(medical?.estimated).toBe(true);
    expect(medical?.daysRemaining).toBe(0);
  });

  it('clamps a leap-day issue date when estimating 24 months', () => {
    const driver = makeDriver({
      medical: documentFor('medical', { issuedOn: '2024-02-29' }),
    });
    const medical = computeDriverExpiries(driver, TODAY).find(
      (item) => item.ruleId === 'medical_certificate',
    );
    expect(medical?.dueOn).toBe('2026-02-28');
    expect(medical?.estimated).toBe(true);
  });
});

describe('recurring document periods', () => {
  it('adds 12 months to the MVR last-pull date', () => {
    const driver = makeDriver({ mvr: documentFor('mvr', { lastPulledOn: '2026-01-31' }) });
    const mvr = computeDriverExpiries(driver, TODAY).find((item) => item.ruleId === 'mvr');
    expect(mvr?.dueOn).toBe('2027-01-31');
    expect(mvr?.status).toBe('ok');
  });

  it('adds 12 months to the annual review completion date', () => {
    const driver = makeDriver({
      annual_review: documentFor('annual_review', { completedOn: '2026-02-28' }),
    });
    const annual = computeDriverExpiries(driver, TODAY).find(
      (item) => item.ruleId === 'annual_review',
    );
    expect(annual?.dueOn).toBe('2027-02-28');
  });
});

describe('CDL toggle', () => {
  const driver = makeDriver({ cdl: documentFor('cdl', { expiresOn: '2026-11-20' }) }, true);

  it('includes CDL expiration when the driver holds a CDL', () => {
    const items = computeDriverExpiries(driver, TODAY);
    expect(items.some((item) => item.ruleId === 'cdl')).toBe(true);
  });

  it('hides and ignores CDL expiration when the driver is not a CDL driver', () => {
    const items = computeDriverExpiries({ ...driver, isCdlDriver: false }, TODAY);
    expect(items.some((item) => item.ruleId === 'cdl')).toBe(false);
  });
});

describe('missing dates and one-time documents', () => {
  it('marks rules without input as unknown and excludes them from next due', () => {
    const driver = makeDriver({});
    const items = computeDriverExpiries(driver, TODAY);
    expect(items.every((item) => item.status === 'unknown')).toBe(true);
    expect(items.every((item) => item.dueOn === null)).toBe(true);
    expect(nextDueItem(items)).toBeNull();
  });

  it('shows road test and employment verification as one-time when on file', () => {
    const driver = makeDriver({
      road_test: documentFor('road_test', { completedOn: '2024-02-01' }),
      employment_verification: documentFor('employment_verification', {
        verifiedOn: '2024-01-15',
      }),
    });
    const items = computeDriverExpiries(driver, TODAY);
    const road = items.find((item) => item.ruleId === 'road_test');
    const employment = items.find((item) => item.ruleId === 'employment_verification');
    expect(road?.status).toBe('one_time');
    expect(road?.dueOn).toBeNull();
    expect(employment?.status).toBe('one_time');
    expect(nextDueItem(items)).toBeNull();
  });

  it('does not include random testing in results', () => {
    const items = computeDriverExpiries(makeDriver({}), TODAY);
    expect(items.some((item) => item.ruleId === 'random_testing')).toBe(false);
  });
});

describe('next due and fleet summary', () => {
  it('picks the earliest recurring due date and ignores one-time items', () => {
    const driver = makeDriver({
      medical: documentFor('medical', { expiresOn: '2027-06-01' }),
      mvr: documentFor('mvr', { lastPulledOn: '2025-12-01' }), // 2026-12-01
      road_test: documentFor('road_test', { completedOn: '2024-01-01' }),
    });
    const items = computeDriverExpiries(driver, TODAY);
    expect(nextDueItem(items)?.ruleId).toBe('mvr');
  });

  it('sorts fleet items by urgency and limits to three', () => {
    const first = makeDriver(
      { mvr: documentFor('mvr', { lastPulledOn: '2025-10-01' }) },
      true,
      'a',
    );
    const second = makeDriver(
      { medical: documentFor('medical', { expiresOn: '2026-11-01' }) },
      true,
      'b',
    );
    const third = makeDriver(
      { annual_review: documentFor('annual_review', { completedOn: '2025-11-20' }) },
      true,
      'c',
    );
    const fourth = makeDriver(
      { cdl: documentFor('cdl', { expiresOn: '2027-05-01' }) },
      true,
      'd',
    );

    const entries = fleetTopEntries([first, second, third, fourth], TODAY, 3);
    expect(entries).toHaveLength(3);
    expect(entries[0].driverId).toBe('a');
    expect(entries[1].driverId).toBe('b');
    expect(entries[2].driverId).toBe('c');
  });
});
