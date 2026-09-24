(function () {
  'use strict';

  if (window.__FTG_AI_CLIENT_ACTIVE__) return;
  window.__FTG_AI_CLIENT_ACTIVE__ = true;

  var state = {
    busy: false,
    history: [],
    patchedPanel: null
  };

  var copy = {
    en: {
      welcome: 'Hi! Ask me about articles, discounts, trails, ferries, buses or trains. I will distinguish live data from scheduled information.',
      placeholder: 'Ask about Cinque Terre…',
      thinking: 'Checking 5TerreGo and current transport data…',
      error: 'I could not complete the check. Please try again shortly.',
      sources: 'Sources'
    },
    it: {
      welcome: 'Ciao! Chiedimi di articoli, sconti, sentieri, battelli, bus o treni. Distinguerò i dati live dagli orari programmati.',
      placeholder: 'Chiedi delle Cinque Terre…',
      thinking: 'Controllo 5TerreGo e i dati di trasporto disponibili…',
      error: 'Non sono riuscito a completare il controllo. Riprova tra poco.',
      sources: 'Fonti'
    },
    fr: {
      welcome: 'Bonjour ! Demandez-moi des articles, réductions, sentiers, bateaux, bus ou trains. Je distinguerai les données en direct des horaires programmés.',
      placeholder: 'Posez une question sur les Cinque Terre…',
      thinking: 'Vérification de 5TerreGo et des transports disponibles…',
      error: 'La vérification a échoué. Réessayez dans un instant.',
      sources: 'Sources'
    },
    de: {
      welcome: 'Hallo! Fragen Sie nach Artikeln, Rabatten, Wegen, Fähren, Bussen oder Zügen. Live-Daten und Fahrpläne werden klar unterschieden.',
      placeholder: 'Frage zu den Cinque Terre…',
      thinking: '5TerreGo und verfügbare Verkehrsdaten werden geprüft…',
      error: 'Die Prüfung konnte nicht abgeschlossen werden. Bitte gleich erneut versuchen.',
      sources: 'Quellen'
    },
    zh: {
      welcome: '你好！可以询问文章、优惠、步道、渡轮、公交或火车。我会明确区分实时信息和计划时刻表。',
      placeholder: '询问五渔村信息…',
      thinking: '正在查询 5TerreGo 和可用的交通信息…',
      error: '暂时无法完成查询，请稍后重试。',
      sources: '来源'
    }
  };

  function getLanguage() {
    var raw = '';
    try { raw = localStorage.getItem('ftg_language') || ''; } catch (_error) {}
    raw = String(raw || document.documentElement.lang || navigator.language || 'en').toLowerCase();
    if (raw.indexOf('-') >= 0) raw = raw.split('-')[0];
    return copy[raw] ? raw : 'en';
  }

  function t(key) {
    var language = getLanguage();
    return (copy[language] && copy[language][key]) || copy.en[key] || key;
  }

  function getPanel() { return document.getElementById('ftg-ai-panel'); }
  function getMessages() { return document.getElementById('ftg-ai-messages'); }
  function getInput() { return document.getElementById('ftg-ai-input'); }
  function getSend() { return document.getElementById('ftg-ai-send'); }

  function addMessage(text, role, extraClass) {
    var messages = getMessages();
    if (!messages) return null;
    var item = document.createElement('div');
    item.className = 'ftg-ai-msg ' + (role === 'user' ? 'user' : 'bot') + (extraClass ? ' ' + extraClass : '');
    item.textContent = String(text || '');
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function addSources(sources) {
    var messages = getMessages();
    if (!messages || !Array.isArray(sources) || !sources.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'ftg-ai-msg bot ftg-ai-source-list';
    var title = document.createElement('strong');
    title.textContent = t('sources') + ': ';
    wrap.appendChild(title);
    sources.slice(0, 5).forEach(function (source, index) {
      if (index) wrap.appendChild(document.createTextNode(' · '));
      if (source.url) {
        var link = document.createElement('a');
        link.href = source.url;
        link.target = source.url.charAt(0) === '/' ? '_self' : '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '[' + (source.id || index + 1) + '] ' + (source.title || '5TerreGo');
        link.style.textDecoration = 'underline';
        link.style.fontWeight = '800';
        wrap.appendChild(link);
      } else {
        wrap.appendChild(document.createTextNode('[' + (source.id || index + 1) + '] ' + (source.title || '5TerreGo')));
      }
    });
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(value) {
    state.busy = !!value;
    var send = getSend();
    var input = getInput();
    if (send) {
      send.disabled = state.busy;
      send.setAttribute('aria-busy', state.busy ? 'true' : 'false');
      send.style.opacity = state.busy ? '.55' : '1';
    }
    if (input) input.disabled = state.busy;
  }

  function patchPanel() {
    var panel = getPanel();
    if (!panel) return false;
    var input = getInput();
    if (input) input.placeholder = t('placeholder');
    var messages = getMessages();
    if (messages && !messages.querySelector('[data-ftg-ai-real-welcome]')) {
      Array.prototype.slice.call(messages.querySelectorAll('.ftg-ai-msg.bot')).forEach(function (node) {
        if (/Nuova actionbar|Active section:/i.test(node.textContent || '')) node.remove();
      });
      var welcome = addMessage(t('welcome'), 'assistant');
      if (welcome) welcome.setAttribute('data-ftg-ai-real-welcome', 'true');
    }
    state.patchedPanel = panel;
    return true;
  }

  function currentPage() {
    try {
      if (window.FTG_GLOBAL_ACTIONBAR && typeof window.FTG_GLOBAL_ACTIONBAR.getCurrentPage === 'function') {
        return window.FTG_GLOBAL_ACTIONBAR.getCurrentPage();
      }
    } catch (_error) {}
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  async function sendMessage(rawText) {
    patchPanel();
    if (state.busy) return;
    var input = getInput();
    var text = String(rawText || (input && input.value) || '').trim();
    if (!text) return;
    addMessage(text, 'user');
    state.history.push({ role: 'user', content: text });
    state.history = state.history.slice(-8);
    if (input) input.value = '';
    var thinking = addMessage(t('thinking'), 'assistant', 'ftg-ai-thinking');
    setBusy(true);
    try {
      var response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language: getLanguage(),
          page: currentPage(),
          history: state.history.slice(0, -1),
          context: { pathname: window.location.pathname, title: document.title }
        })
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || !payload.answer) throw new Error(payload.message || payload.error || 'AI request failed');
      if (thinking) thinking.remove();
      addMessage(payload.answer, 'assistant');
      addSources(payload.sources);
      state.history.push({ role: 'assistant', content: payload.answer });
      state.history = state.history.slice(-8);
    } catch (_error) {
      if (thinking) thinking.remove();
      addMessage(t('error'), 'assistant');
    } finally {
      setBusy(false);
      if (input) input.focus();
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#ftg-ai-send, .ftg-ai-suggestion') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendMessage(target.classList.contains('ftg-ai-suggestion') ? target.textContent : '');
  }, true);

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!target || target.id !== 'ftg-ai-input' || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendMessage('');
  }, true);

  var observer = new MutationObserver(function () { patchPanel(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  patchPanel();
}());
