import { siteConfig } from '../../lib/site';

interface Props {
  driverCount: number;
  savedAt: string | null;
  storageMode: 'ready' | 'memory';
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
}

function savedTime(value: string | null): string {
  if (!value) return 'not yet';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'recently';
  }
}

export default function DataToolbar({
  driverCount,
  savedAt,
  storageMode,
  saveState,
  onExport,
  onImport,
  onClear,
}: Props) {
  return (
    <section className="data-toolbar" aria-labelledby="saved-data-title">
      <div className="data-toolbar-head">
        <h3 id="saved-data-title">Saved data</h3>
        <p className="data-meta">
          {driverCount} of {siteConfig.MAX_DRIVERS} drivers · Last saved: {storageMode === 'memory' ? 'memory only' : savedTime(savedAt)}
          {saveState === 'saving' && storageMode === 'ready' ? ' · saving…' : ''}
        </p>
      </div>
      <div className="data-actions">
        <button type="button" className="btn btn--ghost btn--small" onClick={onExport} disabled={driverCount === 0}>
          Export JSON backup
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onImport}>
          Import JSON backup
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClear} disabled={driverCount === 0}>
          Clear all driver data
        </button>
      </div>
      <p className="data-note">
        Back up to a JSON file before clearing browser data. A backup contains the driver labels and
        dates you entered, so keep the file somewhere private.
      </p>
    </section>
  );
}
