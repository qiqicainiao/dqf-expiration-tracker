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
    // 先挂上旁路上报（不阻塞），再走原有直通逻辑
    context.waitUntil(reportAiBot(context));

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

// ---------------------------------------------------------------- AI 爬虫命中上报
// 施工蓝图 v5.2 阶段 0.5。权威定义见后端仓库 vidrank-api/functions/_middleware.js，
// 名单同步自 config/ai-bot-uas.json；本文件是各站独立副本（改名单须两边一起改）。
// 环境变量：BOT_SITE_ID / BOT_TRACK_URL / BOT_TRACK_TOKEN，任一缺失则静默跳过。
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended',
  'Bytespider', 'CCBot', 'meta-externalagent', 'Amazonbot', 'cohere-ai', 'YouBot',
].sort((a, b) => b.length - a.length);

function matchAiBot(ua) {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const name of AI_BOTS) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  return null;
}

/** 命中即异步上报（waitUntil 不阻塞响应）；任何异常都吞掉，绝不影响站点。 */
function reportAiBot(context) {
  try {
    const bot = matchAiBot(context.request.headers.get('user-agent') || '');
    if (!bot) return;
    const env = context.env || {};
    if (!env.BOT_SITE_ID || !env.BOT_TRACK_URL || !env.BOT_TRACK_TOKEN) return;
    const path = new URL(context.request.url).pathname;
    context.waitUntil(
      fetch(env.BOT_TRACK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bot-track-token': env.BOT_TRACK_TOKEN },
        body: JSON.stringify({ site_id: env.BOT_SITE_ID, bot, path }),
      }).catch(() => undefined)
    );
  } catch (_e) {
    // 旁路自身绝不抛错
  }
}