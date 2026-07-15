(function () {
  'use strict';
  if (window.__FTG_SITE_RUNTIME__) return;
  window.__FTG_SITE_RUNTIME__ = true;

  var CONSENT_KEY = 'ftg_analytics_consent_v1';
  var ENDPOINT = 'https://jpflcbktcnhmlvaibzcw.supabase.co/functions/v1/site-visit';
  var localHost = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    }, { once: true });
  }

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (error) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (error) {}
  }

  function sendPageView() {
    if (localHost || getConsent() !== 'accepted') return;
    try {
      var query = '?page_path=' + encodeURIComponent(location.pathname || '/') +
        '&page_title=' + encodeURIComponent(document.title || '') +
        '&ts=' + Date.now();
      var img = new Image();
      img.referrerPolicy = 'strict-origin-when-cross-origin';
      img.src = ENDPOINT + query;
    } catch (error) {}
  }

  function removeBanner() {
    var banner = document.getElementById('ftg-privacy-banner');
    if (banner) banner.remove();
  }

  function showBanner() {
    if (document.getElementById('ftg-privacy-banner')) return;
    var italian = String(document.documentElement.lang || '').toLowerCase().indexOf('it') === 0;
    var banner = document.createElement('section');
    banner.id = 'ftg-privacy-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', italian ? 'Preferenze privacy' : 'Privacy preferences');
    banner.innerHTML = '<style>#ftg-privacy-banner{position:fixed;z-index:2147483646;left:14px;right:14px;bottom:max(14px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:18px;width:min(760px,calc(100% - 28px));margin:auto;padding:16px 18px;border:1px solid rgba(18,32,51,.16);border-radius:20px;background:#fff;color:#122033;box-shadow:0 20px 70px rgba(18,32,51,.24);font:14px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#ftg-privacy-banner p{margin:0;flex:1;color:#425066}#ftg-privacy-banner a{color:#0d5960;font-weight:800}#ftg-privacy-banner div{display:flex;gap:8px;flex:none}#ftg-privacy-banner button{min-height:42px;padding:10px 15px;border:0;border-radius:999px;font:inherit;font-weight:850;cursor:pointer}#ftg-privacy-reject{background:#eef1f4;color:#122033}#ftg-privacy-accept{background:#122033;color:#fff}@media(max-width:620px){#ftg-privacy-banner{align-items:stretch;flex-direction:column;gap:13px}#ftg-privacy-banner div{width:100%}#ftg-privacy-banner button{flex:1}}</style>' +
      '<p>' + (italian ? 'Usiamo misurazioni anonime solo con il tuo consenso per migliorare 5TerreGo. ' : 'We use anonymous measurements only with your consent to improve 5TerreGo. ') +
      '<a href="/cookie-policy.html">' + (italian ? 'Dettagli' : 'Details') + '</a>.</p>' +
      '<div><button id="ftg-privacy-reject" type="button">' + (italian ? 'Rifiuta' : 'Reject') + '</button><button id="ftg-privacy-accept" type="button">' + (italian ? 'Accetta' : 'Accept') + '</button></div>';
    document.body.appendChild(banner);
    document.getElementById('ftg-privacy-reject').addEventListener('click', function () { setConsent('rejected'); removeBanner(); });
    document.getElementById('ftg-privacy-accept').addEventListener('click', function () { setConsent('accepted'); removeBanner(); sendPageView(); });
  }

  window.FTGPrivacy = {
    openAnalyticsSettings: function () { setConsent(''); showBanner(); },
    analyticsConsent: getConsent
  };

  registerServiceWorker();
  if (localHost) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') {
    setConsent('rejected');
    return;
  }
  if (getConsent() === 'accepted') sendPageView();
  else if (!getConsent()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner, { once: true });
    else showBanner();
  }
})();
