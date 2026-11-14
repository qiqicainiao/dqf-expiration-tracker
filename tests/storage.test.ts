import { beforeEach, describe, expect, it } from 'vitest';
import {
  QUARANTINE_PREFIX,
  STORAGE_KEY,
  buildExport,
  clearStore,
  createStore,
  loadStore,
  parseImportText,
  saveStore,
} from '../src/lib/storage/store';
import { migrate } from '../src/lib/storage/migrate';
import {
  SITE_ID,
  type DocumentDates,
  type DriverRecord,
  type TrackerStoreV1,
} from '../src/lib/storage/schema';

function makeDriver(index: number): DriverRecord {
  const medical: DocumentDates = {
    uuid: `doc-${index}`,
    timestamp: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    siteId: SITE_ID,
    type: 'medical',
    expiresOn: '2027-01-01',
  };
  return {
    uuid: `driver-${index}`,
    timestamp: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1,
    siteId: SITE_ID,
    label: `Driver ${index}`,
    isCdlDriver: true,
    documents: { medical },
  };
}

function quarantineKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(QUARANTINE_PREFIX)) keys.push(key);
  }
  return keys;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('localStorage round trip', () => {
  it('saves and loads a valid store', () => {
    const store = createStore([makeDriver(1)]);
    expect(saveStore(store)).toEqual({ ok: true });

    const result = loadStore();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.store.drivers).toHaveLength(1);
      expect(result.store.siteId).toBe(SITE_ID);
      expect(result.store.drivers[0].documents.medical?.expiresOn).toBe('2027-01-01');
    }
  });

  it('returns empty when nothing is saved', () => {
    expect(loadStore()).toEqual({ status: 'empty' });
  });

  it('rejects more than five drivers instead of silently truncating', () => {
    const store = createStore(Array.from({ length: 6 }, (_, index) => makeDriver(index)));
    expect(saveStore(store)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('clears the stored key', () => {
    saveStore(createStore([makeDriver(1)]));
    expect(clearStore()).toBe(true);
    expect(loadStore()).toEqual({ status: 'empty' });
  });
});

describe('corrupted data and storage availability', () => {
  it('moves invalid JSON to quarantine and clears the main key', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"drivers": [broken');

    const result = loadStore();
    expect(result.status).toBe('corrupted');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(quarantineKeys()).toHaveLength(1);
  });

  it('quarantines schema-invalid data instead of overwriting it', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, siteId: SITE_ID, updatedAt: 'x', rulesVersion: 'x', drivers: [{ bad: true }] }),
    );
    const result = loadStore();
    expect(result.status).toBe('corrupted');
    expect(quarantineKeys()).toHaveLength(1);
  });

  it('reports unavailable when localStorage access throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    try {
      expect(loadStore()).toEqual({ status: 'unavailable' });
      expect(saveStore(createStore([]))).toEqual({ ok: false, reason: 'unavailable' });
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor);
      } else {
        delete (window as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it('reports a newer schema version without quarantining', () => {
    const store = createStore([]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, schemaVersion: 2 }));
    const result = loadStore();
    expect(result.status).toBe('future_version');
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('import validation', () => {
  const store: TrackerStoreV1 = createStore([makeDriver(1)]);

  it('accepts a valid exported backup with exportedAt', () => {
    const result = parseImportText(JSON.stringify(buildExport(store)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.store.drivers).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    const result = parseImportText('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('not valid JSON');
  });

  it('rejects prototype-pollution keys', () => {
    const text = JSON.stringify(store).replace('{', '{"__proto__":{"polluted":true},');
    const result = parseImportText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('unsafe key');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects a mismatched site id', () => {
    const result = parseImportText(JSON.stringify({ ...store, siteId: 'other-site' }));
    expect(result.ok).toBe(false);
  });

  it('rejects more than five imported drivers', () => {
    const tooMany = createStore(Array.from({ length: 5 }, (_, index) => makeDriver(index)));
    tooMany.drivers.push(makeDriver(6));
    const result = parseImportText(JSON.stringify(tooMany));
    expect(result.ok).toBe(false);
  });
});

describe('migration', () => {
  it('treats a missing schemaVersion as version 1', () => {
    const store = createStore([makeDriver(1)]);
    const raw: Record<string, unknown> = { ...store };
    delete raw.schemaVersion;

    const migrated = migrate(raw);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.drivers).toHaveLength(1);
  });
});
