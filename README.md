# DQF Expiration Tracker — P0

Static validation tier: Astro `output: 'static'`, one React island, no Node runtime, no check engine.
All telemetry goes through the platform gateway `POST /bff/dqf-tracker/track` (consent-gated).

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # static output in dist/
npm run preview  # preview the built site
npm run test     # Vitest
```

## Local integration with the PHP BFF

```bash
# terminal 1 — backend single entry (from D:\phpstudy_pro\WWW\vidrank-api)
php -S 127.0.0.1:8090 public/index.php

# terminal 2 — frontend dev server (Vite proxies /bff/* to 127.0.0.1:8090)
npm run dev
```

Override the proxy target with `BFF_PROXY_TARGET=http://127.0.0.1:<port>` if the backend uses another port.

`public/js/telemetry-sdk.js` is a verbatim copy of the platform SDK
(`vidrank-api/public/js/telemetry-sdk.js`) and `public/manifests/dqf-tracker.json` is a verbatim
copy of the generated manifest. Re-sync both whenever the backend regenerates the manifest or
ships a new SDK; never hand-edit them.

## Deploy notes

- Output is pure static HTML/CSS/JS. Serve `dist/` and configure Nginx to strip `/bff/` and forward
  to the platform single entry (`POST /bff/dqf-tracker/track` → `/{site}/track`).
- Replace `https://dqf.example` with the production origin before launch in:
  - `src/lib/site.ts` (`CANONICAL_ORIGIN`)
  - `public/sitemap.xml`
  - `public/robots.txt` (Sitemap line)
  - `public/llms.txt`
  - `astro.config.mjs` (`site`)
- Replace the `privacy@example.com` / `support@example.com` placeholders in `/privacy/` and `/terms/`.
- HTML should be served with `Cache-Control: no-cache`; hashed assets under `/_astro/` can be long-cached.
- Asset strategy: Astro content hash under `/_astro/` (architecture §7.1 option A: content hash **or** version query, not both). `VERSION` in `public/_site_config.js` is the single release version; update it with the release and do not add a second `?v=` strategy on top.
