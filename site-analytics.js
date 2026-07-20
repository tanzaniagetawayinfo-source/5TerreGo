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
  var originalAddSource = MapPrototype.addSource;
  var mapStates = new WeakMap();

  if (typeof originalGetSource !== 'function') return;

  function stateFor(map) {
    var state = mapStates.get(map);
    if (!state) {
      state = {
        orbitFrame: 0,
        focusTimer: 0,
        focusToken: 0,
        interactionBound: false,
        cardObserverBound: false,
        trailKey: '',
        coordinates: null
      };
      mapStates.set(map, state);
    }
    return state;
  }

  function cancelCameraWork(map, keepTrail) {
    var state = stateFor(map);
    if (state.orbitFrame) window.cancelAnimationFrame(state.orbitFrame);
    if (state.focusTimer) window.clearTimeout(state.focusTimer);
    state.orbitFrame = 0;
    state.focusTimer = 0;
    state.focusToken += 1;
    if (!keepTrail) {
      state.trailKey = '';
      state.coordinates = null;
    }
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
    var mobile = window.innerWidth <= 700;
    if (mobile) {
      return {
        top: 78,
        right: 20,
        bottom: Math.max(190, Math.round(window.innerHeight * 0.56)),
        left: 20
      };
    }
    return {
      top: 86,
      right: Math.min(500, Math.round(window.innerWidth * 0.40)),
      bottom: 40,
      left: 40
    };
  }

  function ensureTrailRelief(map) {
    var terrain;
    var mobile = window.innerWidth <= 700;
    var mainWidth = mobile ? 3.2 : 3.8;
    var casingWidth = mobile ? 5.2 : 5.8;
    var trailSource = originalGetSource.call(map, 'normal-trails');
    try {
      terrain = typeof map.getTerrain === 'function' ? map.getTerrain() : null;
      if (!terrain || terrain.source !== 'terrainDem') map.setTerrain({ source: 'terrainDem', exaggeration: 1.45 });
      if (map.getLayer('3d-buildings')) map.setLayoutProperty('3d-buildings', 'visibility', 'none');
      if (map.getLayer('terrain-hillshade')) map.setLayoutProperty('terrain-hillshade', 'visibility', 'none');
      if (map.getLayer('normal-trails-line')) {
        map.setPaintProperty('normal-trails-line', 'line-width', mainWidth);
        map.setPaintProperty('normal-trails-line', 'line-opacity', 1);
      }
      if (trailSource && map.getLayer('normal-trails-line') && !map.getLayer('normal-trails-casing')) {
        map.addLayer({
          id: 'normal-trails-casing',
          type: 'line',
          source: 'normal-trails',
          paint: { 'line-color': '#ffffff', 'line-width': casingWidth, 'line-opacity': 0.78 },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        }, 'normal-trails-line');
      } else if (map.getLayer('normal-trails-casing')) {
        map.setPaintProperty('normal-trails-casing', 'line-width', casingWidth);
        map.setPaintProperty('normal-trails-casing', 'line-opacity', 0.78);
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
      canvas.addEventListener('pointerdown', function () { cancelCameraWork(map, true); }, { passive: true });
      canvas.addEventListener('touchstart', function () { cancelCameraWork(map, true); }, { passive: true });
      canvas.addEventListener('wheel', function () { cancelCameraWork(map, true); }, { passive: true });
    } catch (error) {}
  }

  function startTrailOrbit(map, center, zoom, pitch, initialBearing, token) {
    var state = stateFor(map);
    var bearing = initialBearing;
    var lastTime = window.performance && performance.now ? performance.now() : Date.now();
    var lastStyleRefresh = lastTime;

    function frame(now) {
      var currentTime = Number(now || Date.now());
      var elapsed;
      if (token !== state.focusToken || !trailCardIsOpen()) {
        cancelCameraWork(map, true);
        return;
      }
      elapsed = Math.min(50, Math.max(0, currentTime - lastTime));
      lastTime = currentTime;
      bearing = normalizeDegrees(bearing + elapsed * 0.0042);
      try {
        map.jumpTo({ center: center, zoom: zoom, pitch: pitch, bearing: bearing });
        if (currentTime - lastStyleRefresh > 1200) {
          ensureTrailRelief(map);
          lastStyleRefresh = currentTime;
        }
      } catch (error) {
        cancelCameraWork(map, true);
        return;
      }
      state.orbitFrame = window.requestAnimationFrame(frame);
    }

    state.orbitFrame = window.requestAnimationFrame(frame);
  }

  function focusTrail(map, coordinates, attempt, token) {
    var state = stateFor(map);
    var mobile;
    var pair;
    var transverseBearing;
    var targetPitch;
    var bounds;
    var camera;
    var targetCenter;
    var targetZoom;

    if (token !== state.focusToken) return;
    if (!trailCardIsOpen()) {
      if (attempt < 90) state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, attempt + 1, token); }, 16);
      return;
    }

    mobile = window.innerWidth <= 700;
    pair = farthestTrailPair(coordinates);
    transverseBearing = normalizeDegrees(bearingDegrees(pair[0], pair[1]) + 90);
    targetPitch = mobile ? 64 : 70;
    bounds = new window.maplibregl.LngLatBounds();
    coordinates.forEach(function (coordinate) { bounds.extend(coordinate); });

    bindManualCameraControls(map);
    ensureTrailRelief(map);

    try {
      map.stop();
      map.resize();
      camera = typeof map.cameraForBounds === 'function' ? map.cameraForBounds(bounds, {
        padding: cameraPadding(),
        bearing: transverseBearing,
        pitch: 0,
        maxZoom: mobile ? 15.0 : 15.8
      }) : null;

      if (camera && camera.center && Number.isFinite(Number(camera.zoom))) {
        targetCenter = camera.center;
        targetZoom = Math.max(map.getMinZoom(), Math.min(mobile ? 15.0 : 15.8, Number(camera.zoom) - (mobile ? 0.72 : 0.48)));
      } else {
        map.fitBounds(bounds, {
          padding: cameraPadding(),
          maxZoom: mobile ? 15.0 : 15.8,
          bearing: transverseBearing,
          pitch: 0,
          duration: 0
        });
        targetCenter = map.getCenter();
        targetZoom = Math.max(map.getMinZoom(), map.getZoom() - (mobile ? 0.72 : 0.48));
      }

      map.jumpTo({
        center: targetCenter,
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: transverseBearing
      });
    } catch (error) {
      if (attempt < 30) {
        state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, attempt + 1, token); }, 40);
      } else {
        console.warn('Trail focus unavailable', error);
      }
      return;
    }

    state.focusTimer = window.setTimeout(function () {
      if (token !== state.focusToken || !trailCardIsOpen()) return;
      ensureTrailRelief(map);
      startTrailOrbit(map, targetCenter, targetZoom, targetPitch, transverseBearing, token);
    }, 240);
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

  function trailKey(coordinates) {
    var middle = coordinates[Math.floor(coordinates.length / 2)] || coordinates[0];
    var first = coordinates[0];
    var last = coordinates[coordinates.length - 1];
    return [coordinates.length, first[0], first[1], middle[0], middle[1], last[0], last[1]].join('|');
  }

  function scheduleTrailFocus(map, coordinates, force) {
    var state = stateFor(map);
    var key = trailKey(coordinates);
    var token;
    if (!force && key === state.trailKey && (state.orbitFrame || state.focusTimer)) {
      ensureTrailRelief(map);
      return;
    }
    cancelCameraWork(map, true);
    state.trailKey = key;
    state.coordinates = coordinates;
    token = state.focusToken;
    state.focusTimer = window.setTimeout(function () { focusTrail(map, coordinates, 0, token); }, 0);
  }

  function handleTrailData(map, data) {
    var state = stateFor(map);
    var coordinates = selectedTrailCoordinates(data);
    if (coordinates.length < 2) {
      cancelCameraWork(map, false);
      return;
    }
    scheduleTrailFocus(map, coordinates, false);
    bindTrailCardObserver(map);
    state.coordinates = coordinates;
  }

  function bindTrailCardObserver(map) {
    var state = stateFor(map);
    var card = document.getElementById('trail-card');
    if (state.cardObserverBound || !card) return;
    state.cardObserverBound = true;
    new MutationObserver(function () {
      if (trailCardIsOpen() && state.coordinates && state.coordinates.length >= 2 && !state.orbitFrame && !state.focusTimer) {
        scheduleTrailFocus(map, state.coordinates, true);
      } else if (!trailCardIsOpen() && (state.orbitFrame || state.focusTimer)) {
        cancelCameraWork(map, true);
      }
    }).observe(card, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
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
    bindTrailCardObserver(map);
  }

  MapPrototype.getSource = function (sourceId) {
    var source = originalGetSource.apply(this, arguments);
    if (sourceId === 'normal-trails' && source) bindTrailSource(this, source);
    return source;
  };

  if (typeof originalAddSource === 'function') {
    MapPrototype.addSource = function (sourceId, sourceDefinition) {
      var result = originalAddSource.apply(this, arguments);
      if (sourceId === 'normal-trails') {
        var source = originalGetSource.call(this, sourceId);
        if (source) bindTrailSource(this, source);
        if (sourceDefinition && sourceDefinition.data) handleTrailData(this, sourceDefinition.data);
      }
      return result;
    };
  }
})();

(function () {
  'use strict';

  if (window.__FTG_SEARCH_AUTO_COLLAPSE__) return;
  window.__FTG_SEARCH_AUTO_COLLAPSE__ = true;

  var DRAWER_SELECTOR = '#trail-card, #poi-card, #navigation-planner, #bottom-rail, #god-mode-add-prompt, #discount-modal';
  var OPEN_CLASSES = ['open', 'is-open', 'sheet-expanded', 'steps-open', 'is-expanded', 'expanded', 'is-visible'];
  var activeDrawer = null;
  var touchStartY = 0;
  var collapsedForGesture = false;

  function collapseSearch() {
    var searchFloating = document.getElementById('search-floating');
    var searchToggleBtn = document.getElementById('search-toggle-btn');
    var searchResults = document.getElementById('search-results');
    var searchInput = document.getElementById('search');

    if (!searchFloating || searchFloating.classList.contains('is-collapsed')) return false;

    searchFloating.classList.add('is-collapsed');
    if (searchToggleBtn) {
      searchToggleBtn.setAttribute('aria-expanded', 'false');
      searchToggleBtn.setAttribute('aria-label', 'Open search');
      searchToggleBtn.innerHTML = '<span>⌕</span>';
    }
    if (searchResults) {
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
    }
    if (searchInput) searchInput.blur();
    return true;
  }

  function hasOpenClass(element) {
    return OPEN_CLASSES.some(function (className) {
      return element.classList.contains(className);
    });
  }

  function drawerIsOpen(element) {
    if (!element) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.id === 'trail-card' || element.id === 'poi-card') return element.classList.contains('open');
    if (element.id === 'navigation-planner') {
      return element.classList.contains('steps-open') || document.body.classList.contains('navigation-active');
    }
    return hasOpenClass(element);
  }

  function inspectDrawer(element) {
    if (drawerIsOpen(element)) collapseSearch();
  }

  function bindAutoCollapse() {
    var drawers = Array.prototype.slice.call(document.querySelectorAll(DRAWER_SELECTOR));
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.target === document.body) {
          if (document.body.classList.contains('navigation-active')) collapseSearch();
          return;
        }
        inspectDrawer(record.target);
      });
    });

    drawers.forEach(function (drawer) {
      observer.observe(drawer, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
      inspectDrawer(drawer);
    });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      activeDrawer = event.target && event.target.closest ? event.target.closest(DRAWER_SELECTOR) : null;
      if (!activeDrawer) return;
      touchStartY = event.touches[0].clientY;
      collapsedForGesture = false;
    }, { passive: true, capture: true });

    document.addEventListener('touchmove', function (event) {
      if (!activeDrawer || collapsedForGesture || !event.touches || event.touches.length !== 1) return;
      if (touchStartY - event.touches[0].clientY < 18) return;
      collapsedForGesture = collapseSearch();
    }, { passive: true, capture: true });

    function endDrawerGesture() {
      activeDrawer = null;
      touchStartY = 0;
      collapsedForGesture = false;
    }

    document.addEventListener('touchend', endDrawerGesture, { passive: true, capture: true });
    document.addEventListener('touchcancel', endDrawerGesture, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAutoCollapse, { once: true });
  } else {
    bindAutoCollapse();
  }
})();
