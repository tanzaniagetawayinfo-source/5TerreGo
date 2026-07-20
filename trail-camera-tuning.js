(function () {
  'use strict';

  if (window.__FTG_TRAIL_CAMERA_TUNING__) return;
  window.__FTG_TRAIL_CAMERA_TUNING__ = true;
  if (!window.maplibregl || !window.maplibregl.Map) return;

  var MapPrototype = window.maplibregl.Map.prototype;
  var originalJumpTo = MapPrototype.jumpTo;
  var originalEaseTo = MapPrototype.easeTo;
  var states = new WeakMap();

  if (typeof originalJumpTo !== 'function' || typeof originalEaseTo !== 'function') return;

  function stateFor(map) {
    var state = states.get(map);
    if (!state) {
      state = {
        active: false,
        timer: 0,
        center: null,
        zoom: 0,
        pitch: 0,
        bearing: 0,
        key: '',
        interactionBound: false,
        ignoreSyntheticInteraction: false
      };
      states.set(map, state);
    }
    return state;
  }

  function trailCardIsOpen() {
    var card = document.getElementById('trail-card');
    return Boolean(card && card.classList.contains('open') && card.getAttribute('aria-hidden') !== 'true');
  }

  function clearTimer(state) {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = 0;
  }

  function stopTunedOrbit(map) {
    var state = stateFor(map);
    clearTimer(state);
    state.active = false;
    try { map.stop(); } catch (error) {}
  }

  function mobileTrailOffset(map) {
    var container = map.getContainer ? map.getContainer() : null;
    var viewportHeight = container && container.clientHeight ? container.clientHeight : window.innerHeight;
    var card = document.getElementById('trail-card');
    var cardRect = card ? card.getBoundingClientRect() : null;
    var visibleBottom = cardRect && cardRect.top > 150 && cardRect.top < viewportHeight ? cardRect.top : viewportHeight * 0.48;
    var desiredTrailY = Math.max(112, Math.min(visibleBottom - 54, visibleBottom * 0.46));
    return [0, Math.round(desiredTrailY - viewportHeight / 2)];
  }

  function cameraOffset(map) {
    return window.innerWidth <= 700 ? mobileTrailOffset(map) : [0, 0];
  }

  function centerKey(center, zoom, pitch) {
    var longitude = center && center.lng !== undefined ? center.lng : (Array.isArray(center) ? center[0] : 0);
    var latitude = center && center.lat !== undefined ? center.lat : (Array.isArray(center) ? center[1] : 0);
    return [Number(longitude).toFixed(6), Number(latitude).toFixed(6), Number(zoom).toFixed(3), Number(pitch).toFixed(1)].join('|');
  }

  function cancelLegacyOrbit(map, state) {
    var canvas;
    try {
      canvas = map.getCanvasContainer();
      state.ignoreSyntheticInteraction = true;
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    } catch (error) {
    } finally {
      state.ignoreSyntheticInteraction = false;
    }
  }

  function bindManualControls(map) {
    var state = stateFor(map);
    var canvas;
    var stopFromUser;
    if (state.interactionBound) return;
    state.interactionBound = true;
    try {
      canvas = map.getCanvasContainer();
      stopFromUser = function () {
        if (state.ignoreSyntheticInteraction) return;
        stopTunedOrbit(map);
      };
      canvas.addEventListener('pointerdown', stopFromUser, { passive: true });
      canvas.addEventListener('touchstart', stopFromUser, { passive: true });
      canvas.addEventListener('wheel', stopFromUser, { passive: true });
    } catch (error) {}
  }

  function runOrbitSegment(map, state) {
    var segmentDegrees = 18;
    var duration = 9000;
    if (!state.active || !trailCardIsOpen()) {
      stopTunedOrbit(map);
      return;
    }

    state.bearing += segmentDegrees;
    try {
      originalEaseTo.call(map, {
        center: state.center,
        zoom: state.zoom,
        pitch: state.pitch,
        bearing: state.bearing,
        offset: cameraOffset(map),
        duration: duration,
        easing: function (time) { return time; },
        essential: true
      });
    } catch (error) {
      stopTunedOrbit(map);
      return;
    }

    clearTimer(state);
    state.timer = window.setTimeout(function () {
      runOrbitSegment(map, state);
    }, duration - 80);
  }

  function startTunedCamera(map, options) {
    var state = stateFor(map);
    var zoomAdjustment = window.innerWidth <= 700 ? 0.22 : 0.08;
    var targetZoom = Math.max(map.getMinZoom ? map.getMinZoom() : 0, Number(options.zoom) - zoomAdjustment);
    var key = centerKey(options.center, targetZoom, options.pitch);

    if (state.active && state.key === key) return map;

    clearTimer(state);
    state.active = true;
    state.center = options.center;
    state.zoom = targetZoom;
    state.pitch = Number(options.pitch);
    state.bearing = Number(options.bearing || 0);
    state.key = key;

    cancelLegacyOrbit(map, state);
    bindManualControls(map);

    try {
      originalEaseTo.call(map, {
        center: state.center,
        zoom: state.zoom,
        pitch: state.pitch,
        bearing: state.bearing,
        offset: cameraOffset(map),
        duration: 620,
        easing: function (time) { return time * time * (3 - 2 * time); },
        essential: true
      });
    } catch (error) {
      state.active = false;
      return originalJumpTo.call(map, options);
    }

    state.timer = window.setTimeout(function () {
      runOrbitSegment(map, state);
    }, 600);
    return map;
  }

  function isTrailCameraUpdate(map, options) {
    var source;
    if (!options || !options.center || Number(options.pitch || 0) < 58 || !trailCardIsOpen()) return false;
    try { source = map.getSource('normal-trails'); } catch (error) { source = null; }
    return Boolean(source);
  }

  MapPrototype.jumpTo = function (options) {
    if (isTrailCameraUpdate(this, options)) return startTunedCamera(this, options);
    return originalJumpTo.apply(this, arguments);
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    document.querySelectorAll('.maplibregl-map').forEach(function (container) {
      var canvas = container.querySelector('.maplibregl-canvas');
      if (canvas) canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
  }, { passive: true });
})();
