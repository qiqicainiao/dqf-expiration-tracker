import { useEffect, useState } from 'react';
import { initTelemetry, readConsent, setConsent } from '../../lib/telemetry';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    initTelemetry();
    const stored = readConsent();
    // result-feedback.js 只在 __VR_CONSENT__ === true 时上报（fail-closed，不绕过同意）
    (window as unknown as { __VR_CONSENT__?: boolean }).__VR_CONSENT__ = stored === 'granted';
    if (stored !== 'unset') return;

    // 2026-11-20 修：此前要等 pointerdown/keydown/scroll 才显示横幅（还额外延迟 600ms）。
    // 结果是"打开看一眼就走"的访客永远没有表态机会，这个站永远只有"未表态"流量，
    // pv_real 与可用样本结构性为 0。同意必须首屏就问，且拒绝后功能完全不变。
    setVisible(true);
  }, []);

  if (!visible || decided) return null;

  const choose = (next: 'granted' | 'denied') => {
    setConsent(next);
    (window as unknown as { __VR_CONSENT__?: boolean }).__VR_CONSENT__ = next === 'granted';
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
