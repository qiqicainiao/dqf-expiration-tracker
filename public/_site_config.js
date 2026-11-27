(function migrateLegacyConsent() {
  try {
    var legacy = window.localStorage.getItem('dqf_consent_v1');
    if (legacy !== 'granted' && legacy !== 'denied') return;
    var current = window.localStorage.getItem('vr_consent_v1');
    if (current !== 'granted' && current !== 'denied') {
      window.localStorage.setItem('vr_consent_v1', legacy);
    }
    window.localStorage.removeItem('dqf_consent_v1');
  } catch (error) {}
})();

window.__SITE_CONFIG__ = Object.freeze({
  SITE_ID: 'dqf-tracker',
  PUBLIC_SLUG: 'dqf-expiration-tracker',
  API_BASE: '/bff',
  VERSION: '1.1.1',
  RULES_VERSION: '2026-11-13',
  SCHEMA_VERSION: 1,
  MAX_DRIVERS: 5,
  MAX_JSON_BYTES: 262144
});
