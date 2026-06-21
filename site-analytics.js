(function () {
  'use strict';

  if (window.__FTG_SITE_ANALYTICS__) return;
  window.__FTG_SITE_ANALYTICS__ = true;

  var ENDPOINT = 'https://jpflcbktcnhmlvaibzcw.supabase.co/functions/v1/site-visit';
  var SESSION_KEY = 'ftg-analytics-session-v1';
  var PAGE_KEY_PREFIX = 'ftg-analytics-page-v1:';
  var PAGE_TTL_MS = 1000 * 60 * 30;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_error) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_error) {}
  }

  function getSessionId() {
    var existing = storageGet(SESSION_KEY);
    if (existing) return existing;
    existing = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : 'ftg-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    storageSet(SESSION_KEY, existing);
    return existing;
  }

  function pageKey() {
    return PAGE_KEY_PREFIX + (location.pathname || '/') + '|' + (location.search || '');
  }

  function alreadySentRecently() {
    var lastValue = Number(storageGet(pageKey()) || 0);
    var now = Date.now();
    if (lastValue && (now - lastValue) < PAGE_TTL_MS) return true;
    storageSet(pageKey(), String(now));
    return false;
  }

  function buildPayload() {
    var timezone = '';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_error) {}
    return {
      session_id: getSessionId(),
      page_path: location.pathname || '/',
      page_title: document.title || '',
      referrer: document.referrer || '',
      origin: location.origin || '',
      host: location.host || '',
      lang: navigator.language || '',
      screen: (window.screen && screen.width && screen.height) ? String(screen.width) + 'x' + String(screen.height) : '',
      timezone: timezone
    };
  }

  function send() {
    var body = JSON.stringify(buildPayload());
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        return;
      } catch (_error) {}
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});
    } catch (_error) {}
  }

  if (/^localhost$|^127\./.test(location.hostname)) return;
  if (alreadySentRecently()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', send, { once: true });
  } else {
    send();
  }
}());
