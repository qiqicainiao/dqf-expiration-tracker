import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DriverFormSchema,
  driverFromForm,
  driverToFormValues,
  type DriverFormValues,
  type DriverRecord,
} from '../../lib/storage/schema';
import type { ExpiryItem } from '../../lib/calc/expiry';
import DocumentDateField from './DocumentDateField';
import DriverResultCard from './DriverResultCard';

interface Props {
  driver: DriverRecord;
  index: number;
  items: ExpiryItem[];
  isDraft?: boolean;
  onChange: (driver: DriverRecord) => void;
  onRemove?: () => void;
  onSaveDraft?: (driver: DriverRecord) => void;
  onClearDraft?: () => void;
  onNotify?: (message: string) => void;
}

export default function DriverCard({
  driver,
  index,
  items,
  isDraft = false,
  onChange,
  onRemove,
  onSaveDraft,
  onClearDraft,
  onNotify,
}: Props) {
  const form = useForm<DriverFormValues>({
    resolver: zodResolver(DriverFormSchema),
    mode: 'onBlur',
    defaultValues: driverToFormValues(driver),
  });

  const initialRef = useRef(driver);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    initialRef.current = driver;
  }, [driver]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const subscription = form.watch((values) => {
      const next = driverFromForm(values as DriverFormValues, initialRef.current);
      onChangeRef.current(next);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const isCdlDriver = form.watch('isCdlDriver');
  const errors = form.formState.errors as unknown as {
    documents?: {
      message?: string;
      medical?: { issuedOn?: { message?: string }; expiresOn?: { message?: string } };
      mvr?: { lastPulledOn?: { message?: string } };
      cdl?: { expiresOn?: { message?: string } };
      annual_review?: { completedOn?: { message?: string } };
      road_test?: { completedOn?: { message?: string } };
      employment_verification?: { verifiedOn?: { message?: string } };
    };
  };

  const documentsMessage = errors.documents?.message;

  const handleSubmit = form.handleSubmit((values) => {
    const next = driverFromForm(values, initialRef.current);
    onChange(next);
    if (isDraft) {
      onSaveDraft?.(next);
    } else {
      onNotify?.('Driver saved in this browser.');
    }
  });

  const driverName = driver.label.trim() || `Driver ${index + 1}`;

  return (
    <article className={`driver-card${isDraft ? ' driver-card--draft' : ''}`} id={`driver-${driver.uuid}`}>
      <div className="driver-card-head">
        <div className="driver-card-identity">
          <span className="driver-tab">
            {isDraft ? 'Example draft' : `Driver file ${index + 1}`}
          </span>
          <div className="label-field">
            <label htmlFor={`label-${driver.uuid}`}>Driver name or nickname (optional)</label>
            <input
              id={`label-${driver.uuid}`}
              type="text"
              className="field-input"
              maxLength={30}
              placeholder={`Driver ${index + 1}`}
              autoComplete="off"
              {...form.register('label')}
            />
          </div>
        </div>
        <label className="cdl-row" htmlFor={`cdl-toggle-${driver.uuid}`}>
          <input
            id={`cdl-toggle-${driver.uuid}`}
            type="checkbox"
            {...form.register('isCdlDriver')}
          />
          CDL driver
        </label>
      </div>

      <p className="field-hint cdl-note">
        {isCdlDriver
          ? 'CDL expiration is included because this driver holds a CDL.'
          : 'Turn this off if this driver does not hold a CDL. A saved CDL date is kept but not calculated.'}
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field-grid">
          <fieldset className="field-group">
            <legend className="visually-hidden">Medical examiner's certificate dates</legend>
            <h4>Medical examiner's certificate</h4>
            <DocumentDateField
              id={`medical-issued-${driver.uuid}`}
              label="Issue date"
              registration={form.register('documents.medical.issuedOn')}
              error={errors.documents?.medical?.issuedOn?.message}
              hint="Used only to estimate 24 months when no expiration date is entered."
            />
            <DocumentDateField
              id={`medical-expires-${driver.uuid}`}
              label="Expiration date"
              registration={form.register('documents.medical.expiresOn')}
              error={errors.documents?.medical?.expiresOn?.message}
              hint="Prefer the date printed on the certificate."
            />
          </fieldset>

          <fieldset className="field-group">
            <legend className="visually-hidden">MVR date</legend>
            <h4>MVR pull</h4>
            <DocumentDateField
              id={`mvr-${driver.uuid}`}
              label="Last pulled on"
              registration={form.register('documents.mvr.lastPulledOn')}
              error={errors.documents?.mvr?.lastPulledOn?.message}
              hint="The next MVR date is estimated at 12 months after this date."
            />
          </fieldset>

          {isCdlDriver ? (
            <fieldset className="field-group">
              <legend className="visually-hidden">CDL expiration date</legend>
              <h4>CDL expiration</h4>
              <DocumentDateField
                id={`cdl-${driver.uuid}`}
                label="Expiration date"
                registration={form.register('documents.cdl.expiresOn')}
                error={errors.documents?.cdl?.expiresOn?.message}
                hint="Use the expiration date on the license. No fixed federal cycle is assumed."
              />
            </fieldset>
          ) : null}

          <fieldset className="field-group">
            <legend className="visually-hidden">Annual review date</legend>
            <h4>Annual review</h4>
            <DocumentDateField
              id={`annual-${driver.uuid}`}
              label="Review completed on"
              registration={form.register('documents.annual_review.completedOn')}
              error={errors.documents?.annual_review?.completedOn?.message}
              hint="The next review is estimated at 12 months after this date."
            />
          </fieldset>

          <fieldset className="field-group">
            <legend className="visually-hidden">Road test date</legend>
            <h4>Road test</h4>
            <DocumentDateField
              id={`road-${driver.uuid}`}
              label="Completed on"
              registration={form.register('documents.road_test.completedOn')}
              error={errors.documents?.road_test?.completedOn?.message}
              hint="One-time document: shown as on file, not as a recurring due date."
            />
          </fieldset>

          <fieldset className="field-group">
            <legend className="visually-hidden">Employment verification date</legend>
            <h4>Employment verification</h4>
            <DocumentDateField
              id={`ev-${driver.uuid}`}
              label="Verified on"
              registration={form.register('documents.employment_verification.verifiedOn')}
              error={errors.documents?.employment_verification?.verifiedOn?.message}
              hint="One-time document: shown as on file, not as a recurring due date."
            />
          </fieldset>
        </div>

        {documentsMessage ? (
          <p className="field-error form-error" role="alert">
            {documentsMessage}
          </p>
        ) : null}

        <div className="driver-card-actions">
          <button
            type="submit"
            className="btn btn--small"
            aria-busy={form.formState.isSubmitting ? 'true' : undefined}
            data-loading={form.formState.isSubmitting ? 'true' : undefined}
          >
            {isDraft ? 'Save these dates' : 'Save driver'}
          </button>
          {isDraft ? (
            <button type="button" className="btn btn--ghost btn--small" onClick={onClearDraft}>
              Clear example
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--small" onClick={onRemove}>
              Remove driver
            </button>
          )}
          <p className="note">
            {isDraft
              ? 'Example dates from the link are not saved until you click Save these dates.'
              : 'Changes save automatically in this browser 300 ms after you stop typing.'}
          </p>
        </div>
      </form>

      <DriverResultCard items={items} driverName={driverName} />
    </article>
  );
}
