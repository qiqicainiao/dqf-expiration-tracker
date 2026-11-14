interface Props {
  onAdd: () => void;
  atLimit: boolean;
}

export default function EmptyState({ onAdd, atLimit }: Props) {
  return (
    <div className="empty-state">
      <h3>No drivers yet</h3>
      <p>
        Add your first driver, then enter any dates you already have. Missing dates are allowed; the
        tracker will show what is still needed.
      </p>
      <button type="button" className="btn" onClick={onAdd} disabled={atLimit}>
        Add your first driver
      </button>
    </div>
  );
}
