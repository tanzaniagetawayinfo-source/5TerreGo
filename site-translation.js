(function () {
  'use strict';
  var supported = ['it', 'en', 'fr', 'de', 'zh'];
  var original = (document.documentElement.getAttribute('data-ftg-original-language') || document.documentElement.lang || 'it').split('-')[0].toLowerCase();
  var excluded = 'script,style,noscript,svg,code,pre,textarea,select,option,[data-no-translate],#ftg-global-actionbar-root';
  var running = false;
  var originals = new WeakMap();
  var dynamicTranslationTimer = 0;
  document.documentElement.setAttribute('data-ftg-original-language', original);
  function language() { try { return String(localStorage.getItem('ftg_language') || original).split('-')[0].toLowerCase(); } catch (_) { return original; } }
  function nodes() { var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), out = [], n; while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.trim() && n.parentElement && !n.parentElement.closest(excluded)) { if (!originals.has(n)) originals.set(n, n.nodeValue); out.push(n); } return out; }
  function restoreOriginals(list) { list.forEach(function(n) { if (originals.has(n)) n.nodeValue = originals.get(n); }); }
  function fallbackLanguage(target) { return target === 'zh' ? 'zh-CN' : target; }
  async function translateWithPublicFallback(text, target) {
    var source = String(text || '');
    if (!source.trim()) return source;
    var endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(fallbackLanguage(target)) + '&dt=t&q=' + encodeURIComponent(source);
    var response = await fetch(endpoint);
    if (!response.ok) throw new Error('Public translation fallback unavailable');
    var payload = await response.json();
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error('Invalid public translation response');
    return payload[0].map(function(part) { return Array.isArray(part) ? String(part[0] || '') : ''; }).join('');
  }
  async function translateWithFallback(texts, target) {
    var results = new Array(texts.length), next = 0, workers = [];
    async function worker() { while (next < texts.length) { var index = next++; results[index] = await translateWithPublicFallback(texts[index], target); } }
    for (var i = 0; i < Math.min(10, texts.length); i += 1) workers.push(worker());
    await Promise.all(workers);
    return results;
  }
  async function translate(target) {
    if (running || !supported.includes(target) || !document.body) return;
    running = true;
    try {
      var list = nodes(), key = 'ftg_translation:' + location.pathname + location.search + ':' + target, cached, translations;
      restoreOriginals(list);
      if (target === original) { document.documentElement.lang = original; return; }
      try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) {}
      if (Array.isArray(cached) && cached.length === list.length) { list.forEach(function(n, i) { n.nodeValue = cached[i]; }); document.documentElement.lang = target; return; }
      try {
        var response = await fetch('/api/translate', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ targetLanguage:target, text:list.map(function(n) { return n.nodeValue; }) }) });
        var payload = await response.json();
        if (!response.ok || !Array.isArray(payload.translations) || payload.translations.length !== list.length) throw new Error('Translation service unavailable');
        translations = payload.translations;
      } catch (_) { translations = await translateWithFallback(list.map(function(n) { return n.nodeValue; }), target); }
      if (!Array.isArray(translations) || translations.length !== list.length) throw new Error('Translation service unavailable');
      list.forEach(function(n, i) { n.nodeValue = translations[i]; });
      try { sessionStorage.setItem(key, JSON.stringify(translations)); } catch (_) {}
      document.documentElement.lang = target;
    } catch (error) { console.warn('5TerreGo translation unavailable:', error.message); } finally { running = false; }
  }
  window.addEventListener('ftg:languagechange', function(e) { translate(String(e.detail && e.detail.language || original).split('-')[0].toLowerCase()); });
  window.addEventListener('ftg:translatecontent', function() { translate(language()); });
  window.FTGTranslatePage = function() { return translate(language()); };
  function scheduleDynamicTranslation() {
    if (language() === original) return;
    clearTimeout(dynamicTranslationTimer);
    dynamicTranslationTimer = setTimeout(function() { translate(language()); }, 160);
  }
  function observeDynamicContent() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function(records) {
      if (running) return;
      for (var i = 0; i < records.length; i += 1) {
        if (records[i].addedNodes && records[i].addedNodes.length) { scheduleDynamicTranslation(); return; }
      }
    }).observe(document.body, { childList:true, subtree:true });
  }
  window.addEventListener('DOMContentLoaded', function() { translate(language()); observeDynamicContent(); });
  if (document.readyState !== 'loading') { translate(language()); observeDynamicContent(); }
}());
