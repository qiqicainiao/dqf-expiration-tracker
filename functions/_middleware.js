/**
 * functions/_middleware.js
 *
 * Canonical URL normalisation, in priority order:
 *   1. legacy tool path /dqf-expiration-tracker/* -> / (2026-11-18: tool is now the homepage)
 *   2. www.<domain> -> <domain>
 * Both return HTTP 301 and preserve the query string. The canonical host is derived
 * from the request host itself, so this file embeds no domain and needs no edit when
 * the site is pointed at a different domain.
 *
 * Cloudflare Pages never evaluates .htaccess or nginx.htaccess. `_redirects` is also
 * unreliable for this project (verified 2026-11-18: entries were present in dist/
 * but CF returned 404 for the legacy path), so middleware is the source of truth
 * for redirects. A dashboard Bulk Redirect / Redirect Rule is the zero-Functions
 * equivalent.
 */

const WWW_PREFIX = 'www.';
const LEGACY_TOOL_PREFIX = '/dqf-expiration-tracker';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const host = requestUrl.hostname.toLowerCase();
  const isWww = host.startsWith(WWW_PREFIX) && host.length > WWW_PREFIX.length;
  const path = requestUrl.pathname;
  const isLegacy = path === LEGACY_TOOL_PREFIX || path.startsWith(LEGACY_TOOL_PREFIX + '/');

  if (!isWww && !isLegacy) {
    return context.next();
  }

  const target = new URL(requestUrl.toString());
  if (isWww) {
    target.hostname = host.slice(WWW_PREFIX.length);
  }
  target.protocol = 'https:';
  target.port = '';
  if (isLegacy) {
    target.pathname = '/';
  }

  return new Response(null, {
    status: 301,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
