export interface SiteConfig {
  SITE_ID: string;
  PUBLIC_SLUG: string;
  API_BASE: string;
  VERSION: string;
  RULES_VERSION: string;
  SCHEMA_VERSION: number;
  MAX_DRIVERS: number;
  MAX_JSON_BYTES: number;
}

const FALLBACK_CONFIG: SiteConfig = {
  SITE_ID: 'dqf-tracker',
  PUBLIC_SLUG: 'dqf-expiration-tracker',
  API_BASE: '/bff',
  VERSION: '1.1.0',
  RULES_VERSION: '2026-11-13',
  SCHEMA_VERSION: 1,
  MAX_DRIVERS: 5,
  MAX_JSON_BYTES: 262144,
};

function readConfig(): SiteConfig {
  if (typeof window !== 'undefined' && window.__SITE_CONFIG__) {
    return { ...FALLBACK_CONFIG, ...window.__SITE_CONFIG__ };
  }
  return FALLBACK_CONFIG;
}

export const siteConfig: SiteConfig = readConfig();

export const CANONICAL_ORIGIN = 'https://dqfsuite.com';

export const RULES_VERSION = '2026-11-13';
export const RULES_VERSION_LABEL = `Last rule update: ${RULES_VERSION}`;
export const DISCLAIMER_SENTENCE =
  'These are estimated dates based on the information you entered and 49 CFR Part 391. This is not legal advice and does not guarantee compliance or audit results.';
