import { useEffect, useState } from 'react';
import { initTelemetry, readConsent, setConsent } from '../../lib/telemetry';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    initTelemetry();
    if (readConsent() !== 'unset') return;

    let timer = 0;
    const cleanup = () => {
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('keydown', reveal);
      window.removeEventListener('scroll', reveal);
    };
    function reveal() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(true), 600);
      cleanup();
    }

    window.addEventListener('pointerdown', reveal, { passive: true });
    window.addEventListener('keydown', reveal);
    window.addEventListener('scroll', reveal, { passive: true });

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, []);

  if (!visible || decided) return null;

  const choose = (next: 'granted' | 'denied') => {
    setConsent(next);
    setDecided(true);
    setVisible(false);
  };

  return (
    <aside
      className="consent-banner"
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
    >
      <div className="consent-inner">
        <div className="consent-copy">
          <p className="consent-title" id="consent-title">
            Anonymous usage analytics?
          </p>
          <p className="consent-body" id="consent-body">
            With your permission we record anonymous events — page path, device type, referrer
            host, and bucketed counts such as how many drivers you track. Never driver names,
            dates, or backup files. If you reject, the tracker works the same and we only receive
            event names and counts.
          </p>
        </div>
        <div className="consent-actions">
          <button type="button" className="btn btn--small" onClick={() => choose('granted')}>
            Allow analytics
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => choose('denied')}>
            Reject
          </button>
          <a className="consent-link" href="/privacy/">
            Privacy policy
          </a>
        </div>
      </div>
    </aside>
  );
}
