import { siteConfig } from './site';

export type ConsentState = 'granted' | 'denied' | 'unset';
export type ImportResult = 'success' | 'invalid' | 'version_mismatch';
export type ErrorCode =
  | 'storage_unavailable'
  | 'storage_corrupted'
  | 'storage_write_failed'
  | 'import_invalid'
  | 'import_too_large'
  | 'import_unreadable'
  | 'version_mismatch'
  | 'export_failed';
export type ErrorSurface = 'tracker' | 'import' | 'export';

const CONSENT_KEY = 'dqf_consent_v1';
const FLAGS_KEY = 'dqf_telemetry_flags';

// 带 v= 是为了破缓存：SDK 修了"域名白名单把 dqfsuite.com 全丢掉"的 bug，
// 不带版本号的话浏览器可能继续用旧的、静默丢事件的副本。
const SDK_PATH = '/js/telemetry-sdk.js?v=2.2.0';

interface SdkInitOptions {
  siteId: string;
  endpoint: string;
  manifestUrl?: string;
  consent?: boolean;
  consentMode?: ConsentState;
  production?: boolean;
}

interface TelemetrySdk {
  init(options: SdkInitOptions): void;
  track(event: string, payload?: Record<string, unknown>): void;
  setConsent(value: boolean): void;
}

let sdkPromise: Promise<void> | null = null;
let consentState: ConsentState = 'unset';
let pageLoadedAt = 0;
let firstInteractionAt = 0;
let resultViewed = false;
let dwellSent = false;
let trackerStarted = false;
const errorSentAt: Record<string, number> = {};

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {

  }
}

export function readConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset';
  const value = readStorage(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : 'unset';
}

function setFlag(key: string, value: string): void {
  try {
    const raw = window.sessionStorage.getItem(FLAGS_KEY);
    const flags = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    flags[key] = value;
    window.sessionStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {

  }
}

function getFlag(key: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(FLAGS_KEY);
    if (!raw) return null;
    const flags = JSON.parse(raw) as Record<string, string>;
    return flags[key] ?? null;
  } catch {
    return null;
  }
}

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve) => {
    if (!window.Telemetry) {
      const script = document.createElement('script');
      script.src = SDK_PATH;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
      return;
    }
    resolve();
  });
  return sdkPromise;
}

function sdk(): TelemetrySdk | undefined {
  return window.Telemetry;
}

export function initTelemetry(): void {
  if (typeof window === 'undefined' || pageLoadedAt > 0) return;
  pageLoadedAt = Date.now();
  consentState = readConsent();
  void loadSdk().then(() => {
    const client = sdk();
    if (!client) return;
    client.init({
      siteId: siteConfig.SITE_ID,
      endpoint: `${siteConfig.API_BASE}/${siteConfig.SITE_ID}/track`,
      manifestUrl: `/manifests/${siteConfig.SITE_ID}.json`,
      consent: consentState === 'granted',
      consentMode: consentState,
      production: true,
    });
    bindCtaSources();
    bindDwell();
  });
}

export function setConsent(next: 'granted' | 'denied'): void {
  consentState = next;
  writeStorage(CONSENT_KEY, next);
  void loadSdk().then(() => {
    const client = sdk();
    if (!client) return;
    client.setConsent(next === 'granted');
    client.track('consent_changed', { consent: next === 'granted' });
  });
}

export function track(event: string, payload: Record<string, unknown> = {}): void {
  try {
    sdk()?.track(event, payload);
  } catch {

  }
}

function bindCtaSources(): void {
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null;
      const cta = target?.closest?.('[data-cta-source]');
      const source = cta?.getAttribute('data-cta-source');
      if (source === 'hero_cta' || source === 'article_cta' || source === 'sample_cta') {
        setFlag('cta', source);
      }
    },
    { capture: true, passive: true },
  );
}

function bindDwell(): void {
  const send = () => {
    if (dwellSent) return;
    const path = window.location.pathname;
    const area = path === '/' || path.startsWith('/dqf-expiration-tracker')
      ? 'tracker'
      : path.startsWith('/blog')
        ? 'article'
        : null;
    if (!area) return;
    dwellSent = true;
    track('dwell_recorded', {
      page_area: area,
      dwell_seconds_bucket: dwellSecondsBucket((Date.now() - pageLoadedAt) / 1000),
    });
  };

  let idleTimer = 0;
  const scheduleIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(send, 10000);
  };
  for (const name of ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const) {
    window.addEventListener(name, scheduleIdle, { passive: true });
  }
  window.addEventListener('pagehide', send);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send();
  });
  scheduleIdle();
}

export function startTrackerOnce(): void {
  if (trackerStarted) return;
  trackerStarted = true;
  firstInteractionAt = Date.now();
  const cta = getFlag('cta');
  const source = cta === 'hero_cta' || cta === 'sample_cta' || cta === 'article_cta' ? cta : 'direct';
  track('tracker_started', { source });
}

export function trackDriverAdded(position: number, isCdl: boolean): void {
  startTrackerOnce();
  track('driver_added', {
    driver_index_bucket: driverIndexBucket(position),
    is_cdl: isCdl,
  });
}

export function trackExamplePrefilled(fieldCount: number): void {
  startTrackerOnce();
  track('example_prefilled', {
    source: 'url_param',
    fields_count_bucket: fieldsCountBucket(fieldCount),
  });
}

export function trackResultViewed(stats: {
  driverCount: number;
  overdueCount: number;
  nextDueDays: number | null;
}): void {
  if (resultViewed || stats.driverCount < 1) return;
  resultViewed = true;
  const from = firstInteractionAt || pageLoadedAt;
  const renderMs = Math.max(0, Math.min(60000, Date.now() - from));
  track('result_viewed', {
    driver_count_bucket: driverCountBucket(stats.driverCount),
    overdue_count_bucket: overdueCountBucket(stats.overdueCount),
    next_due_window: nextDueWindow(stats.nextDueDays),
    render_ms: renderMs,
  });
}

export function trackJsonExported(driverCount: number): void {
  track('json_exported', { driver_count_bucket: driverCountBucket(driverCount) });
}

/**
 * Q3 的 export 分子（九站统一事件名）。
 * 与 json_exported 并存而不是替换：前者是对齐判定口径的标准名，
 * 后者是本站历史字段，聚合报表还在用，删了会断历史序列。
 */
export function trackExported(format: 'json' | 'csv', itemCount: number): void {
  track('export', { export_format: format, item_count: itemCount });
}

/** Q3 的 copy 分子。复制的是"最紧急三项"的纯文本清单。 */
export function trackResultCopied(copyFormat: string, itemCount: number): void {
  track('result_copied', { copy_format: copyFormat, item_count: itemCount });
}

export function trackJsonImported(result: ImportResult, driverCount: number): void {
  if (result === 'success') startTrackerOnce();
  track('json_imported', {
    result,

    driver_count_bucket: result === 'success' && driverCount > 0 ? driverCountBucket(driverCount) : '0',
  });
}

export function trackDataCleared(driverCountBefore: number): void {
  track('data_cleared', {
    driver_count_bucket_before: driverCountBucket(driverCountBefore),
  });
}

/** 失败发生在哪一段 —— 排障的第一分叉。按 error code 精确映射，不看 surface（surface 只说是哪个面板）。 */
const STAGE_BY_ERROR_CODE: Record<string, string> = {
  storage_unavailable: 'init',
  storage_write_failed: 'compute',
  storage_corrupted: 'parse',
  import_invalid: 'parse',
  import_unreadable: 'parse',
  import_too_large: 'input',
  version_mismatch: 'parse',
  export_failed: 'compute'
};

export function trackError(code: ErrorCode, surface: ErrorSurface): void {
  const now = Date.now();
  if (errorSentAt[code] && now - errorSentAt[code] < 30000) return;
  errorSentAt[code] = now;
  track('error_shown', { error_code: code, surface });
  // 跨站统一口径的第二行：error_shown 带 surface，tool_failed 带标准阶段。
  track('tool_failed', { error_code: code, error_stage: STAGE_BY_ERROR_CODE[code] || 'unknown' });
}

export function driverCountBucket(count: number): '1' | '2' | '3_5' {
  if (count <= 1) return '1';
  if (count === 2) return '2';
  return '3_5';
}

export function overdueCountBucket(count: number): '0' | '1' | '2_plus' {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  return '2_plus';
}

export function driverIndexBucket(position: number): 'first' | 'second' | 'third_plus' {
  if (position <= 1) return 'first';
  if (position === 2) return 'second';
  return 'third_plus';
}

export function fieldsCountBucket(count: number): '1' | '2' | '3_plus' {
  if (count <= 1) return '1';
  if (count === 2) return '2';
  return '3_plus';
}

export function nextDueWindow(daysRemaining: number | null): 'overdue' | '0_30' | '31_60' | '61_plus' | 'none' {
  if (daysRemaining === null) return 'none';
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 30) return '0_30';
  if (daysRemaining <= 60) return '31_60';
  return '61_plus';
}

export function dwellSecondsBucket(seconds: number): '0_15' | '16_60' | '61_180' | '181_plus' {
  if (seconds <= 15) return '0_15';
  if (seconds <= 60) return '16_60';
  if (seconds <= 180) return '61_180';
  return '181_plus';
}
