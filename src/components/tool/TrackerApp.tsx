import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/tool.css';
import { computeDriverExpiries } from '../../lib/calc/expiry';
import { isValidDateOnly, todayDateOnly } from '../../lib/calc/date';
import {
  SCHEMA_VERSION,
  SITE_ID,
  createUuid,
  type DocumentDates,
  type DocType,
  type DriverRecord,
  type TrackerStoreV1,
} from '../../lib/storage/schema';
import {
  STORAGE_KEY,
  buildExport,
  clearStore,
  createDebouncedSaver,
  createStore,
  downloadJson,
  downloadText,
  isStorageAvailable,
  loadStore,
  onStorageChange,
  saveStore,
} from '../../lib/storage/store';
import { siteConfig } from '../../lib/site';
import {
  trackDataCleared,
  trackDriverAdded,
  trackError,
  trackExamplePrefilled,
  trackJsonExported,
  trackJsonImported,
  trackResultViewed,
  startTrackerOnce,
} from '../../lib/telemetry';
import DriverCard from './DriverCard';
import EmptyState from './EmptyState';
import FleetSummary from './FleetSummary';
import DataToolbar from './DataToolbar';
import ImportDialog from './ImportDialog';
import ClearConfirmDialog from './ClearConfirmDialog';

interface BannerState {
  kind: 'info' | 'danger';
  text: string;
  raw?: string;
  canRetry?: boolean;
  canReload?: boolean;
}

interface ToastState {
  message: string;
  undo?: () => void;
}

interface PrefillResult {
  driver: DriverRecord | null;
  invalidCount: number;
}

const PREFILL_FIELDS: {
  param: string;
  docType: DocType;
  field: 'expiresOn' | 'lastPulledOn' | 'completedOn' | 'verifiedOn';
}[] = [
  { param: 'medical', docType: 'medical', field: 'expiresOn' },
  { param: 'mvr', docType: 'mvr', field: 'lastPulledOn' },
  { param: 'cdl', docType: 'cdl', field: 'expiresOn' },
  { param: 'annual', docType: 'annual_review', field: 'completedOn' },
  { param: 'road', docType: 'road_test', field: 'completedOn' },
  { param: 'ev', docType: 'employment_verification', field: 'verifiedOn' },
];

function buildPrefillDriver(search: string): PrefillResult {
  const params = new URLSearchParams(search);
  const now = new Date().toISOString();
  const documents: Partial<Record<DocType, DocumentDates>> = {};
  let invalidCount = 0;
  let validCount = 0;

  for (const { param, docType, field } of PREFILL_FIELDS) {
    if (!params.has(param)) continue;
    const value = (params.get(param) ?? '').trim();
    if (!isValidDateOnly(value)) {
      invalidCount += 1;
      continue;
    }
    documents[docType] = {
      uuid: createUuid(),
      timestamp: now,
      schemaVersion: SCHEMA_VERSION,
      siteId: SITE_ID,
      type: docType,
      [field]: value,
    } as DocumentDates;
    validCount += 1;
  }

  if (validCount === 0) {
    return { driver: null, invalidCount };
  }

  return {
    driver: {
      uuid: createUuid(),
      timestamp: now,
      schemaVersion: SCHEMA_VERSION,
      siteId: SITE_ID,
      label: '',
      isCdlDriver: true,
      documents,
    },
    invalidCount,
  };
}

function driverLabel(driver: DriverRecord, index: number): string {
  return driver.label.trim() || `Driver ${index + 1}`;
}

export default function TrackerApp() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [draft, setDraft] = useState<DriverRecord | null>(null);
  const [booting, setBooting] = useState(true);
  const [today, setToday] = useState('');
  const [storageMode, setStorageMode] = useState<'ready' | 'memory'>('ready');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [crossTab, setCrossTab] = useState(false);
  const [prefillInvalid, setPrefillInvalid] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const driversRef = useRef<DriverRecord[]>([]);
  const draftRef = useRef<DriverRecord | null>(null);
  const storageModeRef = useRef<'ready' | 'memory'>('ready');
  const saver = useMemo(() => createDebouncedSaver(300), []);
  const toastTimer = useRef<number | null>(null);
  const pendingDelete = useRef<{ driver: DriverRecord; index: number; timer: number } | null>(null);
  const skipFirstSave = useRef(true);
  const skipNextSave = useRef(false);

  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const persist = useCallback(
    (nextDrivers: DriverRecord[], source: 'manual' | 'url_prefill' | 'import' = 'manual') => {
      if (storageModeRef.current === 'memory') {
        setSaveState('error');
        return false;
      }
      const store = createStore(nextDrivers, source);
      const result = saveStore(store);
      if (result.ok) {
        setSavedAt(store.updatedAt);
        setSaveState('saved');
        return true;
      }
      storageModeRef.current = 'memory';
      setStorageMode('memory');
      setSaveState('error');
      trackError('storage_write_failed', 'tracker');
      setBanner({
        kind: 'danger',
        text: 'Your browser is blocking local storage. Data will be lost when you close this tab. Export a JSON backup.',
        canRetry: true,
      });
      return false;
    },
    [],
  );

  useEffect(() => {
    setToday(todayDateOnly());
    const result = loadStore();
    if (result.status === 'ok') {
      setDrivers(result.store.drivers);
      setSavedAt(result.store.meta?.lastSavedAt ?? result.store.updatedAt);
      setSaveState('saved');
    } else if (result.status === 'corrupted') {
      trackError('storage_corrupted', 'tracker');
      setBanner({
        kind: 'danger',
        text: result.message,
        raw: result.raw ?? undefined,
      });
    } else if (result.status === 'unavailable') {
      storageModeRef.current = 'memory';
      setStorageMode('memory');
      setSaveState('error');
      trackError('storage_unavailable', 'tracker');
      setBanner({
        kind: 'danger',
        text: 'Your browser is blocking local storage. Data will be lost when you close this tab. Export a JSON backup.',
        canRetry: true,
      });
    } else if (result.status === 'future_version') {
      setBanner({
        kind: 'danger',
        text: `${result.message} Reload the page after updating, or export the data from the newer version.`,
        canReload: true,
      });
    }

    const prefill = buildPrefillDriver(window.location.search);
    if (prefill.invalidCount > 0) setPrefillInvalid(true);
    if (prefill.driver) {
      setDraft(prefill.driver);
      trackExamplePrefilled(Object.keys(prefill.driver.documents).length);
    }

    setBooting(false);
  }, []);

  useEffect(() => {
    if (booting) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (storageModeRef.current === 'memory') {
      setSaveState('error');
      return;
    }
    if (pendingDelete.current) return;

    setSaveState('saving');
    saver.schedule(() => {
      persist(driversRef.current, 'manual');
    });
  }, [drivers, booting, persist, saver]);

  useEffect(() => {
    return onStorageChange((key) => {
      if (key !== STORAGE_KEY) return;
      setCrossTab(true);
    });
  }, []);

  useEffect(() => {
    return () => {
      saver.cancel();
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      if (pendingDelete.current) window.clearTimeout(pendingDelete.current.timer);
    };
  }, [saver]);

  const handleDriverChange = useCallback((uuid: string, updated: DriverRecord) => {
    startTrackerOnce();
    setDrivers((previous) =>
      previous.map((driver) => (driver.uuid === uuid ? { ...updated, uuid: driver.uuid } : driver)),
    );
  }, []);

  const addDriver = useCallback(() => {
    if (driversRef.current.length + (draftRef.current ? 1 : 0) >= siteConfig.MAX_DRIVERS) {
      return;
    }
    trackDriverAdded(driversRef.current.length + (draftRef.current ? 1 : 0) + 1, true);
    const now = new Date().toISOString();
    setDrivers((previous) => [
      ...previous,
      {
        uuid: createUuid(),
        timestamp: now,
        schemaVersion: SCHEMA_VERSION,
        siteId: SITE_ID,
        label: '',
        isCdlDriver: true,
        documents: {},
      },
    ]);
  }, []);

  const removeDriver = useCallback(
    (uuid: string) => {
      const index = driversRef.current.findIndex((driver) => driver.uuid === uuid);
      if (index < 0) return;
      const driver = driversRef.current[index];
      if (pendingDelete.current) window.clearTimeout(pendingDelete.current.timer);

      setDrivers((previous) => previous.filter((item) => item.uuid !== uuid));
      const label = driverLabel(driver, index);

      const timer = window.setTimeout(() => {
        pendingDelete.current = null;
        persist(driversRef.current, 'manual');
      }, 5000);
      pendingDelete.current = { driver, index, timer };

      showToast(`${label} removed.`, () => {
        const pending = pendingDelete.current;
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingDelete.current = null;
        setDrivers((previous) => {
          const next = [...previous];
          next.splice(Math.min(pending.index, next.length), 0, pending.driver);
          return next;
        });
        setToast(null);
        setSaveState('idle');
      });
    },
    [persist, showToast],
  );

  const handleSaveDraft = useCallback(
    (driver: DriverRecord) => {
      trackDriverAdded(driversRef.current.length + 1, driver.isCdlDriver);
      setDrivers((previous) => {
        if (previous.length >= siteConfig.MAX_DRIVERS) return previous;
        return [...previous, driver];
      });
      setDraft(null);
      setPrefillInvalid(false);
      showToast('Example dates saved in this browser.');
    },
    [showToast],
  );

  const handleExport = useCallback(() => {
    const store = buildExport(createStore(driversRef.current, 'manual'));
    const filename = `dqf-tracker-backup-${todayDateOnly()}.json`;
    const ok = downloadJson(filename, store);
    if (ok) {
      trackJsonExported(driversRef.current.length);
    } else {
      trackError('export_failed', 'export');
    }
    showToast(
      ok ? 'JSON backup downloaded.' : 'Could not create the download. Try another browser.',
    );
  }, [showToast]);

  const handleImport = useCallback(
    (store: TrackerStoreV1) => {
      setDrivers(store.drivers);
      setDraft(null);
      setImportOpen(false);
      const ok = persist(store.drivers, 'import');
      trackJsonImported('success', store.drivers.length);
      showToast(
        ok
          ? `Imported ${store.drivers.length} driver${store.drivers.length === 1 ? '' : 's'}.`
          : 'Imported into memory only. Local storage is blocked.',
      );
    },
    [persist, showToast],
  );

  const handleClear = useCallback(() => {
    saver.cancel();
    trackDataCleared(driversRef.current.length);
    if (pendingDelete.current) {
      window.clearTimeout(pendingDelete.current.timer);
      pendingDelete.current = null;
    }
    skipNextSave.current = true;
    clearStore();
    setDrivers([]);
    setDraft(null);
    setClearOpen(false);
    setSavedAt(null);
    setSaveState('idle');
    setPrefillInvalid(false);
    showToast('All driver data deleted.');
  }, [saver, showToast]);

  const retryStorage = useCallback(() => {
    if (!isStorageAvailable()) {
      showToast('Local storage is still blocked by the browser.');
      return;
    }
    storageModeRef.current = 'ready';
    setStorageMode('ready');
    setBanner(null);
    const ok = persist(driversRef.current, 'manual');
    showToast(ok ? 'Saved in this browser.' : 'Storage is still blocked.');
  }, [persist, showToast]);

  const handleDownloadCorrupted = useCallback(() => {
    if (!banner?.raw) return;
    const ok = downloadText(`dqf-corrupted-${Date.now()}.json`, banner.raw);
    showToast(ok ? 'Saved data downloaded.' : 'Could not create the download.');
  }, [banner, showToast]);

  const driverResults = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeDriverExpiries>>();
    if (!today) return map;
    for (const driver of drivers) {
      map.set(driver.uuid, computeDriverExpiries(driver, today));
    }
    return map;
  }, [drivers, today]);

  const draftResults = useMemo(() => {
    if (!draft || !today) return [];
    return computeDriverExpiries(draft, today);
  }, [draft, today]);

  useEffect(() => {
    if (booting || !today || drivers.length === 0) return;
    let overdue = 0;
    let dated = 0;
    let nextDays: number | null = null;
    for (const items of driverResults.values()) {
      for (const item of items) {
        if (item.status === 'overdue') overdue += 1;
        if (item.daysRemaining !== null) {
          dated += 1;
          nextDays = nextDays === null ? item.daysRemaining : Math.min(nextDays, item.daysRemaining);
        }
      }
    }
    if (dated === 0) return;
    const timer = window.setTimeout(() => {
      trackResultViewed({ driverCount: drivers.length, overdueCount: overdue, nextDueDays: nextDays });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [booting, today, drivers.length, driverResults]);

  const totalSlots = drivers.length + (draft ? 1 : 0);
  const atLimit = totalSlots >= siteConfig.MAX_DRIVERS;

  const saveStatusText = (() => {
    if (booting) return 'Loading saved data…';
    if (storageMode === 'memory') return 'Memory mode — not saved';
    if (saveState === 'saving') return 'Saving…';
    if (saveState === 'error') return 'Not saved — storage blocked';
    if (savedAt) {
      const time = new Date(savedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Saved in this browser · ${time}`;
    }
    return 'Saved in this browser';
  })();

  const saveDotState =
    storageMode === 'memory' || saveState === 'error'
      ? 'error'
      : saveState === 'saving'
        ? 'saving'
        : 'saved';

  return (
    <section className="tracker-shell" id="tracker" aria-labelledby="tracker-title">
      <div className="tracker-head">
        <div>
          <h2 className="tracker-title" id="tracker-title">
            Your DQF working file
          </h2>
          <p className="tracker-subtitle">
            Up to 5 drivers. Partial dates are allowed. Nothing leaves this browser.
          </p>
        </div>
        <span className="save-indicator" role="status" aria-live="polite">
          <span className="save-dot" data-state={saveDotState} aria-hidden="true" />
          {saveStatusText}
        </span>
      </div>

      {banner ? (
        <div className={`banner${banner.kind === 'danger' ? ' banner--danger' : ''}`} role="alert">
          <p>{banner.text}</p>
          <div className="banner-actions">
            {banner.raw ? (
              <button type="button" className="btn btn--ghost btn--small" onClick={handleDownloadCorrupted}>
                Download saved data
              </button>
            ) : null}
            {banner.canRetry ? (
              <button type="button" className="btn btn--ghost btn--small" onClick={retryStorage}>
                Retry saving
              </button>
            ) : null}
            {banner.canReload ? (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {crossTab ? (
        <div className="banner banner--info" role="status">
          <p>This tracker was updated in another tab. Reload to see the latest data.</p>
          <div className="banner-actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setCrossTab(false)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {prefillInvalid ? (
        <div className="banner banner--info" role="status">
          <p>Some example dates in this link were invalid and were ignored.</p>
          <div className="banner-actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPrefillInvalid(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="banner banner--info" role="status">
          <p>Example dates loaded from the link — not saved yet.</p>
          <div className="banner-actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setDraft(null)}
            >
              Clear example
            </button>
          </div>
        </div>
      ) : null}

      {booting ? (
        <div className="tracker-loading" aria-hidden="true" />
      ) : (
        <>
          {draft ? (
            <div className="driver-list">
              <DriverCard
                key={draft.uuid}
                driver={draft}
                index={0}
                items={draftResults}
                isDraft
                onChange={(updated) => setDraft(updated)}
                onSaveDraft={handleSaveDraft}
                onClearDraft={() => {
                  setDraft(null);
                  setPrefillInvalid(false);
                }}
              />
            </div>
          ) : null}

          {drivers.length === 0 && !draft ? (
            <EmptyState onAdd={addDriver} atLimit={atLimit} />
          ) : (
            <div className="driver-list">
              {drivers.map((driver, index) => (
                <DriverCard
                  key={driver.uuid}
                  driver={driver}
                  index={index + (draft ? 1 : 0)}
                  items={driverResults.get(driver.uuid) ?? []}
                  onChange={(updated) => handleDriverChange(driver.uuid, updated)}
                  onRemove={() => removeDriver(driver.uuid)}
                  onNotify={(message) => showToast(message)}
                />
              ))}
            </div>
          )}

          {drivers.length > 0 || draft ? (
            <div className="add-driver-row">
              <button type="button" className="btn btn--ghost" onClick={addDriver} disabled={atLimit}>
                Add another driver
              </button>
              <p className="note">
                {atLimit
                  ? 'The free version supports up to 5 drivers.'
                  : `${siteConfig.MAX_DRIVERS - totalSlots} of ${siteConfig.MAX_DRIVERS} driver slots available.`}
              </p>
            </div>
          ) : null}

          <FleetSummary drivers={drivers} today={today} />

          <DataToolbar
            driverCount={drivers.length}
            savedAt={savedAt}
            storageMode={storageMode}
            saveState={saveState}
            onExport={handleExport}
            onImport={() => setImportOpen(true)}
            onClear={() => setClearOpen(true)}
          />
        </>
      )}

      <ImportDialog
        open={importOpen}
        currentCount={drivers.length}
        onClose={() => setImportOpen(false)}
        onConfirm={handleImport}
      />
      <ClearConfirmDialog
        open={clearOpen}
        driverCount={drivers.length}
        onClose={() => setClearOpen(false)}
        onConfirm={handleClear}
        onBackup={handleExport}
      />

      <div className="toast-region" role="status" aria-live="polite">
        {toast ? (
          <div className="toast">
            <p>{toast.message}</p>
            {toast.undo ? (
              <button type="button" className="btn btn--small" onClick={toast.undo}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
