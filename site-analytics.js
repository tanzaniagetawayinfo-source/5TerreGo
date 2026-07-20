(function () {
  'use strict';
  if (!document.querySelector('script[data-ftg-translation]')) {
    var translationScript = document.createElement('script');
    translationScript.src = '/site-translation.js?v=6';
    translationScript.defer = true;
    translationScript.setAttribute('data-ftg-translation', '');
    document.head.appendChild(translationScript);
  }
  if (window.__FTG_SITE_RUNTIME__) return;
  window.__FTG_SITE_RUNTIME__ = true;

  function expandMapSearchByDefault() {
    var searchFloating = document.getElementById('search-floating');
    var searchToggleBtn = document.getElementById('search-toggle-btn');
    if (!searchFloating || !searchToggleBtn) return;
    searchFloating.classList.remove('is-collapsed');
    searchToggleBtn.setAttribute('aria-expanded', 'true');
    searchToggleBtn.setAttribute('aria-label', 'Close search');
    searchToggleBtn.innerHTML = '<span>×</span>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', expandMapSearchByDefault, { once: true });
  } else {
    expandMapSearchByDefault();
  }

  var CONSENT_KEY = 'ftg_analytics_consent_v1';
  var TEST_OWNER_EMAIL = '5terrego.info@gmail.com';
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

  function getSignedInEmail() {
    var index, key, value, parsed, user;
    try {
      for (index = 0; index < localStorage.length; index += 1) {
        key = localStorage.key(index) || '';
        if (!/^sb-.*-auth-token$/.test(key)) continue;
        value = localStorage.getItem(key);
        if (!value) continue;
        parsed = JSON.parse(value);
        user = parsed && parsed.user ? parsed.user : (parsed && parsed.currentSession && parsed.currentSession.user ? parsed.currentSession.user : null);
        if (user && user.email) return String(user.email).trim().toLowerCase();
      }
    } catch (error) {}
    return '';
  }

  function sendPageView() {
    if (localHost || getConsent() !== 'accepted' || getSignedInEmail() === TEST_OWNER_EMAIL) return;
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

(function () {
  'use strict';

  if (window.__FTG_TRAIL_CAMERA_RUNTIME__) return;
  window.__FTG_TRAIL_CAMERA_RUNTIME__ = true;
  if (!window.maplibregl || !window.maplibregl.Map) return;

  var MapPrototype = window.maplibregl.Map.prototype;
  var originalGetSource = MapPrototype.getSource;
  var mapStates = new WeakMap();

  if (typeof originalGetSource !== 'function') return;

  function stateFor(map) {
    var state = mapStates.get(map);
    if (!state) {
      state = { orbitTimer: null, focusTimer: null, focusToken: 0, interactionBound: false };
      mapStates.set(map, state);
    }
    return state;
  }

  function stopTrailOrbit(map) {
    var state = stateFor(map);
    if (state.orbitTimer) window.clearInterval(state.orbitTimer);
    if (state.focusTimer) window.clearTimeout(state.focusTimer);
    state.orbitTimer = null;
    state.focusTimer = null;
    state.focusToken += 1;
  }

  function normalizeDegrees(value) {
    value = Number(value || 0) % 360;
    return value < 0 ? value + 360 : value;
  }

  function bearingDegrees(from, to) {
    var lat1 = Number(from[1]) * Math.PI / 180;
    var lat2 = Number(to[1]) * Math.PI / 180;
    var longitudeDelta = (Number(to[0]) - Number(from[0])) * Math.PI / 180;
    var y = Math.sin(longitudeDelta) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitudeDelta);
    return normalizeDegrees(Math.atan2(y, x) * 180 / Math.PI);
  }

  function approximateDistanceSquared(a, b) {
    var middleLatitude = ((Number(a[1]) + Number(b[1])) / 2) * Math.PI / 180;
    var longitude = (Number(a[0]) - Number(b[0])) * Math.cos(middleLatitude);
    var latitude = Number(a[1]) - Number(b[1]);
    return longitude * longitude + latitude * latitude;
  }

  function farthestTrailPair(coordinates) {
    var step = Math.max(1, Math.ceil(coordinates.length / 36));
    var sampled = coordinates.filter(function (_, index) { return index % step === 0; });
    var finalPoint = coordinates[coordinates.length - 1];
    var best = [coordinates[0], finalPoint];
    var bestDistance = approximateDistanceSquared(best[0], best[1]);
    var i;
    var j;
    if (sampled[sampled.length - 1] !== finalPoint) sampled.push(finalPoint);
    for (i = 0; i < sampled.length - 1; i += 1) {
      for (j = i + 1; j < sampled.length; j += 1) {
        var distance = approximateDistanceSquared(sampled[i], sampled[j]);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [sampled[i], sampled[j]];
        }
      }
    }
    return best;
  }

  function trailCardIsOpen() {
    var card = document.getElementById('trail-card');
    return Boolean(card && card.classList.contains('open') && card.getAttribute('aria-hidden') !== 'true');
  }

  function cameraPadding() {
    var card = document.getElementById('trail-card');
    var mobile = window.innerWidth <= 700;
    var rectangle = card ? card.getBoundingClientRect() : null;
    if (mobile) {
      return {
        top: 84,
        right: 24,
        bottom: rectangle && rectangle.top > 0 ? Math.max(150, Math.round(window.innerHeight - rectangle.top + 28)) : Math.round(window.innerHeight * 0.58),
        left: 24
      };
    }
    return {
      top: 96,
      right: rectangle && rectangle.left > window.innerWidth * 0.35 ? Math.max(180, Math.round(window.innerWidth - rectangle.left + 30)) : Math.min(520, Math.round(window.innerWidth * 0.42)),
      bottom: 44,
      left: 44
    };
  }

  function ensureTrailRelief(map) {
    var terrain;
    var trailSource = originalGetSource.call(map, 'normal-trails');
    try {
      terrain = typeof map.getTerrain === 'function' ? map.getTerrain() : null;
      if (!terrain || terrain.source !== 'terrainDem') map.setTerrain({ source: 'terrainDem', exaggeration: 1.55 });
      if (map.getLayer('3d-buildings')) map.setLayoutProperty('3d-buildings', 'visibility', 'none');
      if (map.getLayer('terrain-hillshade')) map.setLayoutProperty('terrain-hillshade', 'visibility', 'none');
      if (map.getLayer('normal-trails-line')) {
        map.setPaintProperty('normal-trails-line', 'line-width', 7);
        map.setPaintProperty('normal-trails-line', 'line-opacity', 1);
      }
      if (trailSource && map.getLayer('normal-trails-line') && !map.getLayer('normal-trails-casing')) {
        map.addLayer({
          id: 'normal-trails-casing',
          type: 'line',
          source: 'normal-trails',
          paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.92 },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        }, 'normal-trails-line');
      }
    } catch (error) {
      console.warn('Trail relief styling unavailable', error);
    }
  }

  function bindManualCameraControls(map) {
    var state = stateFor(map);
    var canvas;
    if (state.interactionBound) return;
    state.interactionBound = true;
    try {
      canvas = map.getCanvasContainer();
      canvas.addEventListener('pointerdown', function () { stopTrailOrbit(map); }, { passive: true });
      canvas.addEventListener('touchstart', function () { stopTrailOrbit(map); }, { passive: true });
      canvas.addEventListener('wheel', function () { stopTrailOrbit(map); }, { passive: true });
    } catch (error) {}
  }

  function focusTrail(map, coordinates, attempt, token) {
    var state = stateFor(map);
    var mobile;
    var pair;
    var transverseBearing;
    var bounds;
    var targetCenter;
    var targetZoom;
    var targetPitch;
    var orbitBearing;

    if (token !== state.focusToken) return;
    if (!trailCardIsOpen()) {
      if (attempt < 14) state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, attempt + 1, token); }, 80);
      return;
    }
    if (!map.loaded()) {
      if (attempt < 14) state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, attempt + 1, token); }, 100);
      return;
    }

    mobile = window.innerWidth <= 700;
    pair = farthestTrailPair(coordinates);
    transverseBearing = normalizeDegrees(bearingDegrees(pair[0], pair[1]) + 90);
    targetPitch = mobile ? 67 : 72;
    bounds = new window.maplibregl.LngLatBounds();
    coordinates.forEach(function (coordinate) { bounds.extend(coordinate); });

    bindManualCameraControls(map);
    ensureTrailRelief(map);

    try {
      map.resize();
      map.fitBounds(bounds, {
        padding: cameraPadding(),
        maxZoom: mobile ? 15.1 : 16,
        bearing: transverseBearing,
        pitch: 0,
        duration: 680,
        essential: true
      });
    } catch (error) {
      console.warn('Trail fit unavailable', error);
      return;
    }

    state.focusTimer = window.setTimeout(function () {
      if (token !== state.focusToken || !trailCardIsOpen()) return;
      ensureTrailRelief(map);
      targetCenter = map.getCenter();
      targetZoom = Math.max(map.getMinZoom(), map.getZoom() - (mobile ? 1.05 : 0.72));
      orbitBearing = transverseBearing;
      map.easeTo({
        center: targetCenter,
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: orbitBearing,
        duration: 880,
        essential: true
      });

      state.focusTimer = window.setTimeout(function () {
        if (token !== state.focusToken || !trailCardIsOpen()) return;
        state.orbitTimer = window.setInterval(function () {
          if (token !== state.focusToken || !trailCardIsOpen()) {
            stopTrailOrbit(map);
            return;
          }
          ensureTrailRelief(map);
          orbitBearing = normalizeDegrees(orbitBearing + (mobile ? 2.2 : 2.8));
          map.easeTo({
            center: targetCenter,
            zoom: targetZoom,
            pitch: targetPitch,
            bearing: orbitBearing,
            duration: 1450,
            easing: function (time) { return time; },
            essential: true
          });
        }, 1500);
      }, 920);
    }, 730);
  }

  function selectedTrailCoordinates(data) {
    var features = data && Array.isArray(data.features) ? data.features : [];
    var feature = features.find(function (item) {
      return item && item.geometry && item.geometry.type === 'LineString' && Array.isArray(item.geometry.coordinates) && item.geometry.coordinates.length >= 2;
    });
    return feature ? feature.geometry.coordinates.filter(function (coordinate) {
      return Array.isArray(coordinate) && Number.isFinite(Number(coordinate[0])) && Number.isFinite(Number(coordinate[1]));
    }).map(function (coordinate) { return [Number(coordinate[0]), Number(coordinate[1])]; }) : [];
  }

  function handleTrailData(map, data) {
    var state = stateFor(map);
    var coordinates = selectedTrailCoordinates(data);
    stopTrailOrbit(map);
    if (coordinates.length < 2) return;
    state.focusToken += 1;
    state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, 0, state.focusToken); }, 40);
  }

  function bindTrailSource(map, source) {
    var originalSetData;
    if (!source || source.__ftgTrailCameraBound || typeof source.setData !== 'function') return;
    source.__ftgTrailCameraBound = true;
    originalSetData = source.setData;
    source.setData = function (data) {
      var result = originalSetData.apply(this, arguments);
      handleTrailData(map, data);
      return result;
    };
  }

  MapPrototype.getSource = function (sourceId) {
    var source = originalGetSource.apply(this, arguments);
    if (sourceId === 'normal-trails' && source) bindTrailSource(this, source);
    return source;
  };
})();
