import * as Cesium from 'cesium';
import { WEATHER_LAYER_ID } from './records.js';
import { RADAR_MAX_ZOOM } from './radar.js';

export * from './model.js';
export * from './records.js';
export * from './radar.js';
export { createWeatherSource } from './source.js';

const RADAR_ALPHA = 0.78;
const RADAR_HOLD_MS = 1200;
const RADAR_FADE_MS = 280;

function radarProvider(tileUrl) {
  return new Cesium.UrlTemplateImageryProvider({
    url: tileUrl,
    credit: new Cesium.Credit(
      '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
      false,
    ),
    minimumLevel: 1,
    maximumLevel: RADAR_MAX_ZOOM,
    hasAlphaChannel: true,
  });
}

/** Own one live radar mosaic and its frame loop. */
export function createWeatherLayer({ source, overlayHost } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Weather requires a snapshot source');
  if (!overlayHost) throw new TypeError('Weather requires an overlay host');
  let _viewer = null;
  let _request = null;
  let _layers = [];
  let _signature = '';
  let _frameIndex = 0;
  let _timer = null;
  let _fade = null;
  let _idleCancel = null;
  let _playGeneration = 0;
  let _latestAt = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  function stopLoop() {
    _playGeneration += 1;
    _idleCancel?.();
    _idleCancel = null;
    if (_timer) clearTimeout(_timer);
    _timer = null;
    if (_fade != null && globalThis.cancelAnimationFrame)
      cancelAnimationFrame(_fade);
    _fade = null;
  }

  /**
   * Keep every frame attached. Hiding one drops its tiles, and the next visit
   * then paints only the tiles that arrive during that slice.
   */
  function present(index) {
    _layers.forEach((layer, layerIndex) => {
      layer.show = true;
      layer.alpha = layerIndex === index ? RADAR_ALPHA : 0;
    });
    _frameIndex = index;
    _viewer?.scene?.requestRender?.();
  }

  function presentLatestOnly() {
    const latest = Math.max(0, _layers.length - 1);
    _layers.forEach((layer, layerIndex) => {
      const active = layerIndex === latest;
      layer.show = active;
      layer.alpha = active ? RADAR_ALPHA : 0;
    });
    _frameIndex = latest;
  }

  function pause(ms) {
    if (typeof _viewer?.scene?.globe?.tilesLoaded !== 'boolean')
      return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(finish, ms);
      function finish() {
        clearTimeout(timer);
        if (_idleCancel === cancel) _idleCancel = null;
        resolve();
      }
      function cancel() {
        finish();
      }
      _idleCancel = cancel;
    });
  }

  function armHold(generation) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      _timer = null;
      if (generation !== _playGeneration || !_enabled || _layers.length < 2)
        return;
      fadeTo((_frameIndex + 1) % _layers.length, generation);
    }, RADAR_HOLD_MS);
  }

  function fadeTo(index, generation) {
    const from = _frameIndex;
    const canFade =
      from !== index && typeof globalThis.requestAnimationFrame === 'function';
    if (!canFade) {
      present(index);
      armHold(generation);
      return;
    }
    const started = performance.now();
    const step = (now) => {
      if (generation !== _playGeneration) return;
      const blend = Math.min(1, (now - started) / RADAR_FADE_MS);
      _layers.forEach((layer, layerIndex) => {
        layer.show = true;
        const weight =
          (layerIndex === from ? 1 - blend : 0) +
          (layerIndex === index ? blend : 0);
        layer.alpha = weight === 0 ? 0 : RADAR_ALPHA * weight;
      });
      _viewer?.scene?.requestRender?.();
      if (blend < 1) {
        _fade = requestAnimationFrame(step);
        return;
      }
      _fade = null;
      present(index);
      armHold(generation);
    };
    _fade = requestAnimationFrame(step);
  }

  async function runLoop(generation) {
    // Fill the current frame before the other frames compete for tiles.
    await pause(900);
    if (generation !== _playGeneration || !_enabled) return;
    present(_frameIndex);
    if (_layers.length < 2) return;
    await pause(2200);
    if (generation !== _playGeneration || !_enabled) return;
    fadeTo(0, generation);
  }

  function startLoop() {
    stopLoop();
    const generation = _playGeneration;
    if (!_layers.length) return;
    presentLatestOnly();
    if (_layers.length < 2) return;
    void runLoop(generation);
  }

  function clearFrames() {
    stopLoop();
    for (const layer of _layers) {
      _viewer?.imageryLayers?.remove(layer, true);
    }
    _layers = [];
    _signature = '';
    _frameIndex = 0;
  }

  function installFrames(catalog) {
    const signature = catalog.frames.map((frame) => frame.path).join('|');
    if (signature === _signature && _layers.length) return;
    clearFrames();
    for (const frame of catalog.frames) {
      const layer = _viewer.imageryLayers.addImageryProvider(
        radarProvider(frame.tileUrl),
      );
      layer.alpha = 0;
      layer.show = true;
      _layers.push(layer);
    }
    _signature = signature;
    _latestAt = catalog.latestAt;
    startLoop();
  }

  const layer = {
    id: WEATHER_LAYER_ID,
    name: 'Weather',
    icon: '☁',
    source: 'RainViewer',
    updateInterval: 120_000,

    init(viewer) {
      if (_viewer) throw new Error('Weather layer is already initialized');
      _viewer = viewer;
      _layers = [];
      _signature = '';
      _latestAt = null;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      overlayHost.clearSource(WEATHER_LAYER_ID);
      overlayHost.setVisible(WEATHER_LAYER_ID, false);
    },

    enable() {
      _enabled = true;
      overlayHost.clearSource(WEATHER_LAYER_ID);
      overlayHost.setVisible(WEATHER_LAYER_ID, false);
      if (_layers.length) startLoop();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      clearFrames();
      overlayHost.clearSource(WEATHER_LAYER_ID);
      overlayHost.setVisible(WEATHER_LAYER_ID, false);
    },

    async update(viewer = _viewer) {
      if (!_enabled || !viewer?.imageryLayers) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const catalog = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        installFrames(catalog);
        _lastUpdate = Date.now();
        _lastError = null;
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _lastError = error?.message || 'Weather radar unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    getAnalystRecords() {
      return [];
    },

    getStats() {
      return {
        count: _layers.length ? 1 : 0,
        countLabel: _layers.length ? 'RADAR' : null,
        lastUpdate: _lastUpdate,
        error: _lastError,
        observedAt: _latestAt,
      };
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (viewer) _viewer = viewer;
      clearFrames();
      overlayHost.clearSource(WEATHER_LAYER_ID);
      overlayHost.setVisible(WEATHER_LAYER_ID, false);
      _viewer = null;
      _latestAt = null;
      _lastUpdate = null;
      _lastError = null;
    },
  };
  return layer;
}
