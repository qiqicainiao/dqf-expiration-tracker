import { useEffect, useRef, useState } from 'react';
import { parseImportText } from '../../lib/storage/store';
import { siteConfig } from '../../lib/site';
import { trackError, trackJsonImported } from '../../lib/telemetry';
import type { TrackerStoreV1 } from '../../lib/storage/schema';

interface Props {
  open: boolean;
  currentCount: number;
  onClose: () => void;
  onConfirm: (store: TrackerStoreV1) => void;
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

export default function ImportDialog({ open, currentCount, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<TrackerStoreV1 | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFileName('');
      setErrors([]);
      setPreview(null);
      setReading(false);
    }
  }, [open]);

  const handleFile = async (file: File | undefined) => {
    setErrors([]);
    setPreview(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrors(['Choose a .json backup file.']);
      trackJsonImported('invalid', 0);
      trackError('import_invalid', 'import');
      return;
    }
    if (file.size > siteConfig.MAX_JSON_BYTES) {
      setErrors(['This file is larger than 256 KB.']);
      trackJsonImported('invalid', 0);
      trackError('import_too_large', 'import');
      return;
    }
    setFileName(file.name);
    setReading(true);
    try {
      const text = await readFileText(file);
      const result = parseImportText(text);
      if (result.ok) {
        setPreview(result.store);
      } else {
        setErrors(result.errors);
        const versionMismatch = result.errors.some((error) => /newer version/i.test(error));
        trackJsonImported(versionMismatch ? 'version_mismatch' : 'invalid', 0);
        trackError(versionMismatch ? 'version_mismatch' : 'import_invalid', 'import');
      }
    } catch {
      setErrors(['We could not read that file. Try another backup.']);
      trackJsonImported('invalid', 0);
      trackError('import_unreadable', 'import');
    } finally {
      setReading(false);
    }
  };

  const previewCount = preview?.drivers.length ?? 0;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="import-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <h2 id="import-title">Import a JSON backup</h2>
        <p>
          Importing replaces the {currentCount} driver{currentCount === 1 ? '' : 's'} currently in
          this browser. Your current data stays untouched unless you confirm.
        </p>

        <label className="field" htmlFor="import-file">
          <span>Backup file (.json, 256 KB max)</span>
          <input
            id="import-file"
            className="file-input"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
            disabled={reading}
          />
        </label>

        {reading ? <p role="status">Reading file…</p> : null}

        {errors.length > 0 ? (
          <div role="alert">
            <p className="field-error">This file could not be imported. Your current data was not changed.</p>
            <ul className="import-errors">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview ? (
          <div className="import-preview">
            <p>
              <strong>{fileName || 'Backup file'}</strong> contains {previewCount} driver
              {previewCount === 1 ? '' : 's'}.
            </p>
            <p>
              Confirm to replace the current {currentCount} driver{currentCount === 1 ? '' : 's'}.
              Consider exporting a backup first.
            </p>
          </div>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={!preview}
            onClick={() => {
              if (preview) onConfirm(preview);
            }}
          >
            Replace with {previewCount} driver{previewCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
