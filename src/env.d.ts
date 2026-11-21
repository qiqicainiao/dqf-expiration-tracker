/// <reference types="astro/client" />

import type { SiteConfig } from './lib/site';

declare global {
  interface Window {
    __SITE_CONFIG__?: Partial<SiteConfig>;

    Telemetry?: {
      init(options: {
        siteId: string;
        endpoint: string;
        manifestUrl?: string;
        consent?: boolean;
        consentMode?: 'granted' | 'denied' | 'unset';
        production?: boolean;
      }): void;
      track(event: string, payload?: Record<string, unknown>): void;
      setConsent(value: boolean): void;
      _diag?(): unknown;
    };
  }
}

export {};
