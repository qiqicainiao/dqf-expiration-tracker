/**
 * emit-csp-hashes.mjs —— 把当前构建真实产生的内联脚本 sha256 写进 dist/_headers。
 *
 * 为什么需要它：
 *   Astro 的 island hydration runtime 是**内联** <script>，而本站 CSP 是
 *   `script-src 'self'`。内联脚本必须给 sha256 哈希才放行。哈希依赖构建产物，
 *   手写进源码必然随构建漂移（2026-11-20 就因此线上所有岛屿 hydrate 失败，
 *   而 HTTP 层一切正常：200 + 内容齐全，只有控制台报 CSP，没有任何监控能看见）。
 *
 * 做法：构建后扫 dist/**\/*.html，取出所有可执行内联脚本的**原始文本**，
 * 计算 sha256 → base64，去重后替换 dist/_headers 里的 __INLINE_SCRIPT_HASHES__。
 *
 * 注意：`type="application/ld+json"` 等数据块不是脚本，浏览器不执行，
 * 也不受 script-src 约束，必须排除；否则会把无关哈希塞进 CSP（无害但误导）。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = (process.env.DIST_DIR || new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const HEADERS = join(DIST, '_headers');
const PLACEHOLDER = '__INLINE_SCRIPT_HASHES__';

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 抓出所有「会执行」的内联脚本正文。 */
function inlineScripts(html) {
  const found = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;            // 外链脚本不受内联哈希约束
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) continue;
    if (body.trim() === '') continue;
    found.push(body);
  }
  return found;
}

const files = (await walk(DIST)).filter((f) => extname(f).toLowerCase() === '.html');
if (files.length === 0) {
  console.error('[csp-hashes] dist 下没有 html，构建可能失败，拒绝写 _headers');
  process.exit(1);
}

const hashes = new Set();
let scanned = 0;
for (const f of files) {
  const html = await readFile(f, 'utf8');
  for (const body of inlineScripts(html)) {
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    scanned++;
  }
}

let headers;
try {
  headers = await readFile(HEADERS, 'utf8');
} catch {
  console.error('[csp-hashes] dist/_headers 不存在（public/_headers 是否被删了？）');
  process.exit(1);
}

if (!headers.includes(PLACEHOLDER)) {
  console.error(`[csp-hashes] _headers 里没有 ${PLACEHOLDER}，拒绝静默通过`);
  process.exit(1);
}

const list = [...hashes].sort().join(' ');
// 只替换 Content-Security-Policy 行：占位符在文件头的注释里也出现（用来说明机制），
// 若全文件替换会把注释改花，后来人读到的就是一堆哈希，看不懂原本在讲什么。
let hit = 0;
headers = headers.split('\n').map((line) => {
  if (!/^\s*Content-Security-Policy:/i.test(line)) return line;
  hit++;
  return line.split(PLACEHOLDER).join(list);
}).join('\n');
if (hit === 0) {
  console.error('[csp-hashes] 找不到 Content-Security-Policy 行，拒绝写产物');
  process.exit(1);
}
await writeFile(HEADERS, headers, 'utf8');

const csp = /Content-Security-Policy:(.*)/.exec(headers)?.[1]?.trim() ?? '';
const inPolicy = csp.split(';').find((s) => s.trim().startsWith('script-src'))?.trim() ?? '';
console.log(`[csp-hashes] ${files.length} 个页面 / ${scanned} 段内联脚本 → ${hashes.size} 个唯一哈希`);
for (const h of [...hashes].sort()) console.log('  ' + h);
if (hashes.size > 12) {
  console.warn('[csp-hashes] 唯一哈希数偏多（>12），说明内联脚本碎片化，建议收敛为外链 script');
}
if (!inPolicy.includes('sha256-') && hashes.size > 0) {
  console.error('[csp-hashes] 写完了但 script-src 里读不到哈希，模板有问题');
  process.exit(1);
}
