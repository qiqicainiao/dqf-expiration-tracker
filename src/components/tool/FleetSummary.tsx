import { useMemo } from 'react';
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
  if (entries.length === 0) return null;

  return (
    <section className="fleet-summary" aria-labelledby="fleet-title" aria-live="polite">
      <h3 id="fleet-title">Fleet summary · 3 most urgent items</h3>
      <p className="fleet-note">
        Across all drivers in this browser. Calculated with your device date.
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
