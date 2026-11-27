/// <reference types="astro/client" />

import type { SiteConfig } from './lib/site';

declare global {
  interface Window {
    __SITE_CONFIG__?: Partial<SiteConfig>;

    VR: {
      run(site: string): {
        ok(): void;
        fail(errorCode?: 'input_invalid' | 'timeout' | 'upstream_5xx' | 'quota' | 'auth' | 'unknown'): void;
      };
      setConsent(value: boolean): void;
      debug(): { consentMode: 'granted' | 'denied' | 'unset' };
    };
  }
}

export {};
