import { formatHumanDate } from '../../lib/calc/date';
import {
  countMissingInputs,
  nextDueItem,
  type ExpiryItem,
  type ExpiryStatus,
} from '../../lib/calc/expiry';
import { DISCLAIMER_SENTENCE } from '../../lib/site';

interface Props {
  items: ExpiryItem[];
  driverName: string;
}

const GROUP_ORDER: { status: ExpiryStatus; title: string }[] = [
  { status: 'overdue', title: 'Overdue' },
  { status: 'due_30', title: 'Due within 30 days' },
  { status: 'due_60', title: 'Due within 60 days' },
  { status: 'ok', title: 'On track' },
  { status: 'one_time', title: 'One-time documents on file' },
  { status: 'unknown', title: 'Not tracked yet' },
];

const BADGE_TEXT: Record<ExpiryStatus, string> = {
  overdue: 'OVERDUE',
  due_30: 'DUE 30',
  due_60: 'DUE 60',
  ok: 'OK',
  unknown: 'NEED DATE',
  one_time: 'ON FILE',
};

const BADGE_ICON: Record<ExpiryStatus, string> = {
  overdue: '!',
  due_30: '▲',
  due_60: '▲',
  ok: '✓',
  unknown: '–',
  one_time: '✓',
};

function daysText(item: ExpiryItem): string {
  if (item.status === 'unknown') return 'Add a date to track';
  if (item.status === 'one_time') return 'On file';
  const days = item.daysRemaining ?? 0;
  if (days < 0) {
    const abs = Math.abs(days);
    return `Overdue by ${abs} day${abs === 1 ? '' : 's'}`;
  }
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

export default function DriverResultCard({ items, driverName }: Props) {
  const next = nextDueItem(items);
  const missing = countMissingInputs(items);

  return (
    <section className="result-card" aria-label={`Results for ${driverName}`} aria-live="polite">
      <div className="result-head">
        {next ? (
          <div>
            <p className="result-next-label">Next estimated due date</p>
            <p className="result-next-date">{formatHumanDate(next.dueOn as string)}</p>
            <p className="result-next-doc">
              {next.label} · {daysText(next)}
              {next.estimated ? ' · estimated from issue date' : ''}
            </p>
          </div>
        ) : (
          <div>
            <p className="result-next-label">Next estimated due date</p>
            <p className="result-empty">
              No recurring dates yet. Add an MVR, medical, CDL, or annual review date to see the
              next due date.
            </p>
          </div>
        )}
        {next ? (
          <span className={`stamp stamp--${next.status}`}>
            <span className="stamp-icon" aria-hidden="true">
              {BADGE_ICON[next.status]}
            </span>
            {BADGE_TEXT[next.status]}
          </span>
        ) : null}
      </div>

      <div className="status-groups">
        {GROUP_ORDER.map((group) => {
          const groupItems = items.filter((item) => item.status === group.status);
          if (groupItems.length === 0) return null;
          return (
            <div key={group.status}>
              <h4 className="status-group-title">
                {group.title} <span aria-hidden="true">·</span> {groupItems.length}
              </h4>
              <ul className="status-list">
                {groupItems.map((item) => (
                  <li className="status-row" key={item.ruleId}>
                    <div className="status-row-main">
                      <span className="status-doc">{item.label}</span>
                      <span className="status-meta">
                        <span>{daysText(item)}</span>
                        {item.dueOn ? <span>· {formatHumanDate(item.dueOn)}</span> : null}
                        <span className="citation">· {item.citation}</span>
                        {item.estimated ? <span className="estimated-badge">Estimated</span> : null}
                      </span>
                    </div>
                    <div className="status-side">
                      <span className={`stamp stamp--${item.status}`}>
                        <span className="stamp-icon" aria-hidden="true">
                          {BADGE_ICON[item.status]}
                        </span>
                        {BADGE_TEXT[item.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {missing > 0 ? (
        <p className="result-foot">
          Add {missing} more date{missing === 1 ? '' : 's'} to see a complete picture for this
          driver.
        </p>
      ) : null}
      <p className="result-foot">{DISCLAIMER_SENTENCE}</p>
    </section>
  );
}
