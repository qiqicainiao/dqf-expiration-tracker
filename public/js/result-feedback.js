/**
 * result-feedback.js —— 工具型结果反馈条（v1，2026-11-20）
 *
 * 为什么需要：audiogram-gen / dqf-tracker / youtube-tag 这类"生成型工具"没有 rule_id，
 * 用不了 correction_confirmed/submitted（那需要判定对象），于是根本没有收集入口——
 * 用户看完结果没有任何途径说"有用/没用"，产品改进和 Q5 全靠猜。
 *
 * 契约（必须遵守）：
 *   · 只在 `window.__VR_CONSENT__ === true` 时发送；未同意一律不发（fail-closed，不绕过同意横幅）；
 *   · 只发 `result_feedback`（verdict + reason_tag + output_kind），不带任何自由文本/UA/指纹；
 *   · 该事件落行为层 + labels，**不进 samples** —— 它没有判定对象，不能冒充"可用样本"。
 *
 * 接入（每站两行）：
 *   <script src="/js/result-feedback.js" defer></script>
 *   <div data-result-feedback data-output-kind="tag_list"></div>   ← 可选锚点；无锚点则挂在 main 末尾
 */
(function (global) {
  'use strict';
  if (global.__VR_RESULT_FEEDBACK__) { return; }
  global.__VR_RESULT_FEEDBACK__ = true;

  var REASONS = [
    ['wrong_result', '结果不对'],
    ['missing_feature', '缺了我要的东西'],
    ['too_slow', '太慢'],
    ['confusing', '看不懂'],
    ['other', '其他']
  ];

  function cfg() {
    var c = global.__SITE_CONFIG__ || global.__TP_ENV__ || {};
    var siteId = c.SITE_ID || c.siteId || '';
    var api = c.API_BASE || '';
    return { siteId: String(siteId), api: String(api) };
  }

  function sessRef(siteId) {
    try {
      var v = global.sessionStorage.getItem('vidrank_sess_ref');
      if (v && v.indexOf(siteId + ':') === 0) { return v; }
    } catch (e) { }
    return siteId + ':' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function send(siteId, event) {
    var api = cfg().api;
    var endpoint = api ? api.replace(/\/$/, '') + '/' + siteId + '/track' : '/bff/' + siteId + '/track';
    var body = JSON.stringify({
      site_id: siteId,
      consent: true,
      sess_ref: sessRef(siteId),
      page_path: String((global.location && global.location.pathname) || '/').split('?')[0],
      events: [event]
    });
    try {
      if (global.navigator && global.navigator.sendBeacon) {
        if (global.navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) { return; }
      }
    } catch (e) { }
    try {
      global.fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(function () { });
    } catch (e) { }
  }

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  function mount(root, outputKind) {
    if (root.querySelector('.vr-fb')) { return; }
    var box = el('div', 'vr-fb');
    box.style.cssText = 'margin:16px 0;padding:12px 14px;border:1px solid rgba(128,128,128,.28);border-radius:10px;'
      + 'font-size:14px;line-height:1.5;display:flex;flex-wrap:wrap;gap:8px;align-items:center';

    var label = el('span', null, '这个结果有用吗？');
    var good = el('button', 'vr-fb-good', '有用');
    var bad = el('button', 'vr-fb-bad', '没用');
    [good, bad].forEach(function (b) {
      b.type = 'button';
      b.style.cssText = 'padding:6px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.35);'
        + 'background:transparent;color:inherit;cursor:pointer;font:inherit';
    });

    var thanks = el('span', 'vr-fb-thanks');
    thanks.style.cssText = 'color:#16a34a;display:none';

    var detail = el('div', 'vr-fb-detail');
    detail.style.cssText = 'display:none;gap:8px;flex-wrap:wrap;align-items:center;width:100%';
    var sel = el('select', 'vr-fb-reason');
    sel.style.cssText = 'padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,.35);'
      + 'background:transparent;color:inherit;font:inherit';
    REASONS.forEach(function (r) {
      var o = el('option', null, r[1]);
      o.value = r[0];
      sel.appendChild(o);
    });
    var submit = el('button', 'vr-fb-submit', '提交');
    submit.type = 'button';
    submit.style.cssText = 'padding:6px 12px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer;font:inherit';

    function done(text) {
      thanks.textContent = text;
      thanks.style.display = '';
      detail.style.display = 'none';
      good.disabled = true;
      bad.disabled = true;
      good.style.opacity = '0.5';
      bad.style.opacity = '0.5';
    }

    function fire(verdict, reason) {
      if (global.__VR_CONSENT__ !== true) {
        done('已记录你的选择（未同意匿名统计，本次不上报）');
        return;
      }
      var siteId = cfg().siteId;
      if (!siteId) { done('已记录，但站点标识缺失，无法上报'); return; }
      send(siteId, { event: 'result_feedback', verdict: verdict, reason_tag: reason, output_kind: outputKind || 'other' });
      done(verdict === 'good' ? '谢谢！' : '收到，我们会按这个方向改。');
    }

    good.addEventListener('click', function () { fire('good', 'none'); });
    bad.addEventListener('click', function () { detail.style.display = 'flex'; });
    submit.addEventListener('click', function () { fire('bad', sel.value || 'other'); });

    detail.appendChild(sel);
    detail.appendChild(submit);
    box.appendChild(label);
    box.appendChild(good);
    box.appendChild(bad);
    box.appendChild(thanks);
    box.appendChild(detail);
    root.appendChild(box);
  }

  function boot() {
    var d = global.document;
    var anchor = d.querySelector('[data-result-feedback]');
    if (anchor) {
      mount(anchor, anchor.getAttribute('data-output-kind'));
      return;
    }
    // 无显式锚点：挂到主内容末尾（不猜结果区结构，避免改版即失效），
    // 但**默认隐藏**——"结果还没出来就问有没有用"是假的交互。等旁路看到结果事件再显示。
    var host = d.querySelector('main') || d.body;
    if (!host) { return; }
    mount(host, d.body.getAttribute('data-output-kind'));
    var box = host.querySelector('.vr-fb');
    if (box) { box.style.display = 'none'; }
    watchResult(box);
  }

  var RESULT_EVENTS = /"(tool_completed|check_completed|generate_completed|generate_success|extract_success|result_ready|report_ready|audit_completed|json_exported)"/;

  function watchResult(box) {
    if (!box) { return; }
    var d = global.document;
    var shown = false;
    var reveal = function () {
      if (shown) { return; }
      shown = true;
      box.style.display = 'flex';
    };
    var scan = function (body) {
      try {
        if (typeof body === 'string' && RESULT_EVENTS.test(body)) { reveal(); }
      } catch (e) { }
    };
    if (global.fetch) {
      var origFetch = global.fetch;
      global.fetch = function (input, init) {
        try { if (init && typeof init.body === 'string' && /\/track(\?|$)/.test(String(input))) { scan(init.body); } } catch (e) { }
        return origFetch.apply(this, arguments);
      };
    }
    if (global.navigator && global.navigator.sendBeacon) {
      var origBeacon = global.navigator.sendBeacon.bind(global.navigator);
      global.navigator.sendBeacon = function (url, data) {
        try { if (typeof data === 'string') { scan(data); } } catch (e) { }
        return origBeacon(url, data);
      };
    }
    // 兜底：站点若直接渲染产物（video/canvas/结果表格）而不发事件，看到产物才允许反馈。
    // 不用"等 N 秒就显示"——结果没出来就问"有用吗"，是假的交互。
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (shown || tries > 90) { clearInterval(timer); return; }
      if (d.querySelector('video[src], canvas, #result-feedback, .result-card, .results')) { reveal(); clearInterval(timer); }
    }, 1000);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
