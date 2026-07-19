(function () {
  'use strict';

  var supported = ['it', 'en', 'fr', 'de', 'zh'];
  var originalLanguage = (document.documentElement.getAttribute('data-ftg-original-language') || document.documentElement.lang || 'it').split('-')[0].toLowerCase();
  var excluded = 'script,style,noscript,svg,code,pre,textarea,select,option,[data-no-translate],#ftg-global-actionbar-root';
  var maxItems = 180;
  var maxChars = 24000;
  var originalText = new WeakMap();
  var translatedText = new WeakMap();
  var pendingNodes = new Set();
  var observer;
  var queueTimer;
  var requestedLanguage = currentLanguage();
  var requestVersion = 0;

  document.documentElement.setAttribute('data-ftg-original-language', originalLanguage);

  function currentLanguage() {
    try { return String(localStorage.getItem('ftg_language') || originalLanguage).split('-')[0].toLowerCase(); } catch (_error) { return originalLanguage; }
  }

  function isTranslatable(node) {
    return !!(node && node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim() && node.parentElement && !node.parentElement.closest(excluded));
  }

  function collectTextNodes(root) {
    var nodes = [];
    if (!root || !document.body) return nodes;
    if (isTranslatable(root)) nodes.push(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) if (isTranslatable(node)) nodes.push(node);
    return nodes;
  }

  function cacheKey(language) { return 'ftg_translation_cache:' + language; }

  function readCache(language) {
    try {
      var value = JSON.parse(sessionStorage.getItem(cacheKey(language)) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_error) { return {}; }
  }

  function writeCache(language, cache) {
    try { sessionStorage.setItem(cacheKey(language), JSON.stringify(cache)); } catch (_error) {}
  }

  function splitBatches(items) {
    var batches = [], batch = [], chars = 0;
    items.forEach(function (item) {
      if (batch.length && (batch.length >= maxItems || chars + item.length > maxChars)) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(item);
      chars += item.length;
    });
    if (batch.length) batches.push(batch);
    return batches;
  }

  async function getTranslations(language, source) {
    var cache = readCache(language);
    var missing = source.filter(function (text) { return !Object.prototype.hasOwnProperty.call(cache, text); });
    var batches = splitBatches(missing);
    for (var i = 0; i < batches.length; i += 1) {
      var response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language, text: batches[i] })
      });
      if (!response.ok) throw new Error('Translation service unavailable');
      var payload = await response.json();
      if (!Array.isArray(payload.translations) || payload.translations.length !== batches[i].length) throw new Error('Invalid translation response');
      batches[i].forEach(function (text, index) { cache[text] = payload.translations[index]; });
    }
    writeCache(language, cache);
    return cache;
  }

  async function translateNodes(nodes, language, version) {
    var validNodes = nodes.filter(isTranslatable);
    if (!validNodes.length || version !== requestVersion) return;
    validNodes.forEach(function (node) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    });
    if (language === originalLanguage) {
      validNodes.forEach(function (node) {
        var source = originalText.get(node);
        if (typeof source === 'string') {
          node.nodeValue = source;
          translatedText.set(node, source);
        }
      });
      document.documentElement.lang = originalLanguage;
      return;
    }
    var source = Array.from(new Set(validNodes.map(function (node) { return originalText.get(node); }).filter(Boolean)));
    if (!source.length) return;
    var translations = await getTranslations(language, source);
    if (version !== requestVersion || language !== requestedLanguage) return;
    validNodes.forEach(function (node) {
      var translated = translations[originalText.get(node)];
      if (typeof translated === 'string' && node.isConnected) {
        node.nodeValue = translated;
        translatedText.set(node, translated);
      }
    });
    document.documentElement.lang = language;
  }

  function schedulePendingTranslation() {
    if (queueTimer) return;
    queueTimer = window.setTimeout(function () {
      queueTimer = 0;
      var nodes = Array.from(pendingNodes);
      pendingNodes.clear();
      translateNodes(nodes, requestedLanguage, requestVersion).catch(function (error) {
        console.warn('5TerreGo translation unavailable:', error.message);
      });
    }, 80);
  }

  function observeDynamicContent() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'characterData' && isTranslatable(record.target)) {
          if (translatedText.get(record.target) !== record.target.nodeValue) originalText.set(record.target, record.target.nodeValue);
          pendingNodes.add(record.target);
          return;
        }
        Array.prototype.forEach.call(record.addedNodes, function (added) {
          collectTextNodes(added).forEach(function (node) { pendingNodes.add(node); });
        });
      });
      if (pendingNodes.size) schedulePendingTranslation();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function translatePage(language) {
    language = String(language || originalLanguage).split('-')[0].toLowerCase();
    if (!supported.includes(language) || !document.body) return;
    requestedLanguage = language;
    requestVersion += 1;
    var version = requestVersion;
    translateNodes(collectTextNodes(document.body), language, version).catch(function (error) {
      console.warn('5TerreGo translation unavailable:', error.message);
    });
  }

  function start() {
    observeDynamicContent();
    translatePage(currentLanguage());
  }

  window.addEventListener('ftg:languagechange', function (event) {
    translatePage(event.detail && event.detail.language);
  });
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
