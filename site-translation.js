(function () {
  'use strict';

  var supported = ['it', 'en', 'fr', 'de', 'zh'];
  var originalLanguage = (document.documentElement.getAttribute('data-ftg-original-language') || document.documentElement.lang || 'it').split('-')[0].toLowerCase();
  var excluded = 'script,style,noscript,svg,code,pre,textarea,select,option,[data-no-translate],#ftg-global-actionbar-root';
  var running = false;

  document.documentElement.setAttribute('data-ftg-original-language', originalLanguage);

  function currentLanguage() {
    try { return String(localStorage.getItem('ftg_language') || originalLanguage).split('-')[0].toLowerCase(); } catch (_error) { return originalLanguage; }
  }

  function textNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [], node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim() || !node.parentElement || node.parentElement.closest(excluded)) continue;
      nodes.push(node);
    }
    return nodes;
  }

  function cacheKey(language) { return 'ftg_translation:' + location.pathname + location.search + ':' + language; }

  async function translate(language) {
    if (language === originalLanguage && document.documentElement.lang !== originalLanguage) { location.reload(); return; }
    if (running || !supported.includes(language) || language === originalLanguage || !document.body) return;
    running = true;
    try {
      var key = cacheKey(language), cached;
      try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_error) { cached = null; }
      var nodes = textNodes();
      if (cached && Array.isArray(cached) && cached.length === nodes.length) {
        nodes.forEach(function (node, index) { node.nodeValue = cached[index]; });
        document.documentElement.lang = language;
        return;
      }
      var source = nodes.map(function (node) { return node.nodeValue; });
      if (!source.length) return;
      var response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language, text: source })
      });
      if (!response.ok) throw new Error('Translation service unavailable');
      var payload = await response.json();
      if (!Array.isArray(payload.translations) || payload.translations.length !== nodes.length) throw new Error('Invalid translation response');
      nodes.forEach(function (node, index) { node.nodeValue = payload.translations[index]; });
      try { sessionStorage.setItem(key, JSON.stringify(payload.translations)); } catch (_error) {}
      document.documentElement.lang = language;
    } catch (error) {
      console.warn('5TerreGo translation unavailable:', error.message);
    } finally {
      running = false;
    }
  }

  window.addEventListener('ftg:languagechange', function (event) {
    translate(String(event.detail && event.detail.language || originalLanguage).split('-')[0].toLowerCase());
  });
  window.addEventListener('DOMContentLoaded', function () { translate(currentLanguage()); });
  if (document.readyState !== 'loading') translate(currentLanguage());
}());
