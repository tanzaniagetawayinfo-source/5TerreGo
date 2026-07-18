(function () {
  'use strict';

  var supported = ['it', 'en', 'fr', 'de', 'zh'];
  var original = (document.documentElement.getAttribute('data-ftg-original-language') || document.documentElement.lang || 'it').split('-')[0].toLowerCase();
  var excluded = 'script,style,noscript,svg,code,pre,textarea,select,option,[data-no-translate],#ftg-global-actionbar-root';
  var maxItems = 180, maxChars = 24000;
  var originals = new WeakMap(), translated = new WeakMap(), pending = new Set();
  var observer, timer = 0, requested = language(), version = 0;

  document.documentElement.setAttribute('data-ftg-original-language', original);

  function language() { try { return String(localStorage.getItem('ftg_language') || original).split('-')[0].toLowerCase(); } catch (_) { return original; } }
  function fallbackLanguage(target) { return target === 'zh' ? 'zh-CN' : target; }
  function isTranslatable(node) { return !!(node && node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim() && node.parentElement && !node.parentElement.closest(excluded)); }
  function collect(root) {
    var out = [], node, walker;
    if (!root || !document.body) return out;
    if (isTranslatable(root)) out.push(root);
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while ((node = walker.nextNode())) if (isTranslatable(node)) out.push(node);
    return out;
  }
  function cacheKey(target) { return 'ftg_translation_cache:' + target; }
  function readCache(target) { try { var value = JSON.parse(sessionStorage.getItem(cacheKey(target)) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  function writeCache(target, cache) { try { sessionStorage.setItem(cacheKey(target), JSON.stringify(cache)); } catch (_) {} }
  function splitBatches(items) {
    var batches = [], batch = [], chars = 0;
    items.forEach(function (item) {
      if (batch.length && (batch.length >= maxItems || chars + item.length > maxChars)) { batches.push(batch); batch = []; chars = 0; }
      batch.push(item); chars += item.length;
    });
    if (batch.length) batches.push(batch);
    return batches;
  }
  async function publicTranslate(text, target) {
    var response = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(fallbackLanguage(target)) + '&dt=t&q=' + encodeURIComponent(text));
    if (!response.ok) throw new Error('Public translation fallback unavailable');
    var payload = await response.json();
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error('Invalid public translation response');
    return payload[0].map(function (part) { return Array.isArray(part) ? String(part[0] || '') : ''; }).join('');
  }
  async function publicTranslateAll(texts, target) {
    var results = new Array(texts.length), next = 0, workers = [];
    async function worker() { while (next < texts.length) { var index = next++; results[index] = await publicTranslate(texts[index], target); } }
    for (var i = 0; i < Math.min(8, texts.length); i += 1) workers.push(worker());
    await Promise.all(workers);
    return results;
  }
  async function translationsFor(target, source) {
    var cache = readCache(target), missing = source.filter(function (text) { return !Object.prototype.hasOwnProperty.call(cache, text); });
    var batches = splitBatches(missing);
    for (var i = 0; i < batches.length; i += 1) {
      var batch = batches[i], values;
      try {
        var response = await fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetLanguage: target, text: batch }) });
        var payload = await response.json();
        if (!response.ok || !Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error('Translation service unavailable');
        values = payload.translations;
      } catch (_) { values = await publicTranslateAll(batch, target); }
      batch.forEach(function (text, index) { cache[text] = values[index]; });
    }
    writeCache(target, cache);
    return cache;
  }
  async function translateNodes(nodes, target, requestVersion) {
    var list = nodes.filter(isTranslatable);
    if (!list.length || requestVersion !== version) return;
    list.forEach(function (node) { if (!originals.has(node)) originals.set(node, node.nodeValue); });
    if (target === original) {
      list.forEach(function (node) { var source = originals.get(node); if (typeof source === 'string') { node.nodeValue = source; translated.set(node, source); } });
      document.documentElement.lang = original;
      return;
    }
    var source = Array.from(new Set(list.map(function (node) { return originals.get(node); }).filter(Boolean)));
    if (!source.length) return;
    var cache = await translationsFor(target, source);
    if (requestVersion !== version || target !== requested) return;
    list.forEach(function (node) {
      var value = cache[originals.get(node)];
      if (typeof value === 'string' && node.isConnected) { node.nodeValue = value; translated.set(node, value); }
    });
    document.documentElement.lang = target;
  }
  function schedule() {
    if (timer) return;
    timer = window.setTimeout(function () {
      timer = 0;
      var nodes = Array.from(pending); pending.clear();
      translateNodes(nodes, requested, version).catch(function (error) { console.warn('5TerreGo translation unavailable:', error.message); });
    }, 100);
  }
  function observe() {
    if (observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'characterData' && isTranslatable(record.target)) {
          if (translated.get(record.target) !== record.target.nodeValue) originals.set(record.target, record.target.nodeValue);
          pending.add(record.target);
        } else {
          Array.prototype.forEach.call(record.addedNodes, function (node) { collect(node).forEach(function (textNode) { pending.add(textNode); }); });
        }
      });
      if (pending.size) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function translate(target) {
    target = String(target || original).split('-')[0].toLowerCase();
    if (!supported.includes(target) || !document.body) return Promise.resolve();
    requested = target; version += 1;
    return translateNodes(collect(document.body), target, version).catch(function (error) { console.warn('5TerreGo translation unavailable:', error.message); });
  }
  function start() { observe(); translate(language()); }

  window.addEventListener('ftg:languagechange', function (event) { translate(event.detail && event.detail.language); });
  window.addEventListener('ftg:translatecontent', function () { translate(language()); });
  window.FTGTranslatePage = function () { return translate(language()); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}());
