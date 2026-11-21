import { RULES_VERSION, siteConfig } from '../site';
import { MigrationError, migrate } from './migrate';
import {
  SCHEMA_VERSION,
  SITE_ID,
  TrackerStoreSchema,
  hasUnsafeKeys,
  type DriverRecord,
  type TrackerStoreV1,
} from './schema';

export const STORAGE_KEY = 'dqf_tracker_v1';
export const QUARANTINE_PREFIX = 'dqf_tracker_quarantine_';

export type LoadResult =
  | { status: 'ok'; store: TrackerStoreV1; migrated: boolean }
  | { status: 'empty' }
  | { status: 'corrupted'; raw: string | null; quarantineKey: string | null; message: string }
  | { status: 'unavailable' }
  | { status: 'future_version'; message: string };

export interface SaveResult {
  ok: boolean;
  reason?: 'invalid' | 'quota' | 'unavailable';
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isStorageAvailable(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const probe = '__dqf_probe__';
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function quarantineRaw(raw: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const key = `${QUARANTINE_PREFIX}${Date.now()}`;
  try {
    storage.setItem(key, raw);
    storage.removeItem(STORAGE_KEY);
    return key;
  } catch {
    return null;
  }
}

export function loadStore(): LoadResult {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (!raw || !raw.trim()) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const quarantineKey = quarantineRaw(raw);
    return {
      status: 'corrupted',
      raw,
      quarantineKey,
      message: "We couldn't read your saved data. The original was kept for download.",
    };
  }

  try {
    const store = migrate(parsed);
    return { status: 'ok', store, migrated: false };
  } catch (error) {
    if (error instanceof MigrationError && error.code === 'newer') {
      return { status: 'future_version', message: error.message };
    }
    const quarantineKey = quarantineRaw(raw);
    const message =
      error instanceof Error ? error.message : "We couldn't read your saved data.";
    return { status: 'corrupted', raw, quarantineKey, message };
  }
}

export function saveStore(store: TrackerStoreV1): SaveResult {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: 'unavailable' };

  const parsed = TrackerStoreSchema.safeParse(store);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'quota' };
  }
}

export function clearStore(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createStore(
  drivers: DriverRecord[],
  source: 'manual' | 'url_prefill' | 'import' = 'manual',
): TrackerStoreV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    siteId: SITE_ID,
    updatedAt: now,
    rulesVersion: RULES_VERSION,
    drivers,
    meta: { lastSavedAt: now, source },
  };
}

export interface ExportEnvelope extends TrackerStoreV1 {
  exportedAt: string;
}

export function buildExport(store: TrackerStoreV1): ExportEnvelope {
  return { ...store, exportedAt: new Date().toISOString() };
}

export type ImportParseResult =
  | { ok: true; store: TrackerStoreV1 }
  | { ok: false; errors: string[] };

export function parseImportText(text: string): ImportParseResult {
  if (text.length > siteConfig.MAX_JSON_BYTES) {
    return { ok: false, errors: ['This file is larger than 256 KB.'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }

  if (hasUnsafeKeys(parsed)) {
    return { ok: false, errors: ['This file contains an unsafe key and was rejected.'] };
  }

  try {
    const store = migrate(parsed);
    return { ok: true, store };
  } catch (error) {
    if (error instanceof MigrationError) {
      return { ok: false, errors: [error.message] };
    }
    return { ok: false, errors: ['This file does not match the tracker backup format.'] };
  }
}

export function downloadJson(filename: string, data: unknown): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export function onStorageChange(callback: (key: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: StorageEvent) => callback(event.key);
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export interface DebouncedSaver {
  schedule(callback: () => void): void;
  cancel(): void;
}

export function createDebouncedSaver(delayMs = 300): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(callback) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
