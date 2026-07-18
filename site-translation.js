(function () {
  'use strict';
  var supported = ['it', 'en', 'fr', 'de', 'zh'];
  var original = (document.documentElement.getAttribute('data-ftg-original-language') || document.documentElement.lang || 'it').split('-')[0].toLowerCase();
  var excluded = 'script,style,noscript,svg,code,pre,textarea,select,option,[data-no-translate],#ftg-global-actionbar-root';
  var running = false;
  document.documentElement.setAttribute('data-ftg-original-language', original);
  function language() { try { return String(localStorage.getItem('ftg_language') || original).split('-')[0].toLowerCase(); } catch (_) { return original; } }
  function nodes() { var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), out = [], n; while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.trim() && n.parentElement && !n.parentElement.closest(excluded)) out.push(n); return out; }
  async function translate(target) {
    if (running || !supported.includes(target) || target === original || !document.body) return;
    running = true;
    try {
      var list = nodes(), key = 'ftg_translation:' + location.pathname + location.search + ':' + target, cached;
      try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) {}
      if (Array.isArray(cached) && cached.length === list.length) { list.forEach(function(n, i) { n.nodeValue = cached[i]; }); document.documentElement.lang = target; return; }
      var response = await fetch('/api/translate', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ targetLanguage:target, text:list.map(function(n) { return n.nodeValue; }) }) });
      var payload = await response.json();
      if (!response.ok || !Array.isArray(payload.translations) || payload.translations.length !== list.length) throw new Error('Translation service unavailable');
      list.forEach(function(n, i) { n.nodeValue = payload.translations[i]; });
      try { sessionStorage.setItem(key, JSON.stringify(payload.translations)); } catch (_) {}
      document.documentElement.lang = target;
    } catch (error) { console.warn('5TerreGo translation unavailable:', error.message); } finally { running = false; }
  }
  window.addEventListener('ftg:languagechange', function(e) { translate(String(e.detail && e.detail.language || original).split('-')[0].toLowerCase()); });
  window.addEventListener('DOMContentLoaded', function() { translate(language()); });
  if (document.readyState !== 'loading') translate(language());
}());
