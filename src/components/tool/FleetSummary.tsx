import { useMemo, useState } from 'react';
import { formatHumanDate } from '../../lib/calc/date';
import { fleetTopEntries } from '../../lib/calc/expiry';
import type { DriverRecord } from '../../lib/storage/schema';

interface Props {
  drivers: DriverRecord[];
  today: string;
}

function urgencyText(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days);
    return `Overdue by ${abs} day${abs === 1 ? '' : 's'}`;
  }
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

export default function FleetSummary({ drivers, today }: Props) {
  const entries = useMemo(() => fleetTopEntries(drivers, today, 3), [drivers, today]);
  const [copied, setCopied] = useState(false);
  if (entries.length === 0) return null;

  const copyList = () => {
    const lines = entries.map((entry) => {
      const index = drivers.findIndex((driver) => driver.uuid === entry.driverId);
      const label = entry.driverLabel.trim() || `Driver ${index + 1}`;
      return `${label} — ${entry.item.label}: ${formatHumanDate(entry.item.dueOn as string)} (${urgencyText(entry.item.daysRemaining as number)})`;
    });
    const text = ['DQF expiry — 3 most urgent items', ...lines].join('\n');
    const done = (ok: boolean) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand ? document.execCommand('copy') : false;
      document.body.removeChild(ta);
      done(ok);
    } catch {
      done(false);
    }
  };

  return (
    <section className="fleet-summary" aria-labelledby="fleet-title" aria-live="polite">
      <h3 id="fleet-title">Fleet summary · 3 most urgent items</h3>
      <p className="fleet-note">
        Across all drivers in this browser. Calculated with your device date.
        {' '}
        <button type="button" className="btn btn--ghost btn--small" onClick={copyList}>
          {copied ? 'Copied' : 'Copy list'}
        </button>
      </p>
      <ul className="fleet-list">
        {entries.map((entry) => {
          const index = drivers.findIndex((driver) => driver.uuid === entry.driverId);
          const label = entry.driverLabel.trim() || `Driver ${index + 1}`;
          return (
            <li className="fleet-row" key={`${entry.driverId}-${entry.item.ruleId}`}>
              <div className="fleet-row-main">
                <span className="fleet-driver">{label}</span>
                <span className="fleet-doc">{entry.item.label}</span>
                <span className="citation">{entry.item.citation}</span>
              </div>
              <div className="fleet-due">
                <span>{formatHumanDate(entry.item.dueOn as string)}</span>
                <span className={`stamp stamp--${entry.item.status}`}>
                  <span className="stamp-icon" aria-hidden="true">
                    {entry.item.status === 'ok' ? '✓' : '▲'}
                  </span>
                  {urgencyText(entry.item.daysRemaining as number)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
