import { SCHEMA_VERSION, TrackerStoreSchema, hasUnsafeKeys, type TrackerStoreV1 } from './schema';

export type MigrationErrorCode = 'newer' | 'invalid';

export class MigrationError extends Error {
  code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

type Migration = (input: unknown) => unknown;

const migrations: Record<number, Migration> = {};

export function migrate(raw: unknown): TrackerStoreV1 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MigrationError('invalid', 'Saved data is not an object.');
  }
  if (hasUnsafeKeys(raw)) {
    throw new MigrationError('invalid', 'Saved data contains an unsafe key.');
  }

  const rawVersion = (raw as { schemaVersion?: unknown }).schemaVersion;
  let version = typeof rawVersion === 'number' ? rawVersion : 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new MigrationError('invalid', 'Saved data has an invalid schema version.');
  }
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      'newer',
      'This saved data was created by a newer version of the tracker.',
    );
  }

  let current: unknown = raw;
  if (typeof rawVersion !== 'number') {
    current = { ...(raw as Record<string, unknown>), schemaVersion: SCHEMA_VERSION };
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) {
      throw new MigrationError('invalid', `No migration registered for version ${version}.`);
    }
    current = step(current);
    version += 1;
  }

  const parsed = TrackerStoreSchema.safeParse(current);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') || 'root';
    throw new MigrationError('invalid', `Saved data is invalid at ${path}: ${first?.message}`);
  }

  return parsed.data as TrackerStoreV1;
}
