import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  driverCount: number;
  onClose: () => void;
  onConfirm: () => void;
  onBackup: () => void;
}

export default function ClearConfirmDialog({
  open,
  driverCount,
  onClose,
  onConfirm,
  onBackup,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="clear-title"
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
        <h2 id="clear-title">Delete all driver data?</h2>
        <p>
          This removes {driverCount} driver{driverCount === 1 ? '' : 's'} and every date stored in
          this browser. It cannot be undone unless you have a JSON backup.
        </p>
        <p>Back up first if you may want these records later.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onBackup}>
            Download backup first
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger btn--small" onClick={onConfirm}>
            Delete all driver data
          </button>
        </div>
      </div>
    </dialog>
  );
}
