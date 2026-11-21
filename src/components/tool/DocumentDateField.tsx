import { useEffect, useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface Props {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  hint?: string;
}

export default function DocumentDateField({ id, label, registration, error, hint }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const [supportsDateInput, setSupportsDateInput] = useState(true);

  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'date';
    setSupportsDateInput(input.type === 'date');
  }, []);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={supportsDateInput ? 'date' : 'text'}
        className="field-input"
        min="1900-01-01"
        max="2100-12-31"
        inputMode={supportsDateInput ? undefined : 'numeric'}
        placeholder={supportsDateInput ? undefined : 'YYYY-MM-DD'}
        pattern={supportsDateInput ? undefined : '\\d{4}-\\d{2}-\\d{2}'}
        autoComplete="off"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...registration}
      />
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
