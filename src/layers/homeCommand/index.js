import * as Cesium from 'cesium';
import { createHomeCommandDemo } from '../../data/homeCommand/demo.js';
import {
  HOME_COMMAND_LAYER_ID,
  HOME_COMMAND_SITE,
  HOME_COMMAND_SOURCE_NAME,
  HOME_COMMAND_UPDATE_MS,
} from './policy.js';
import { createHomeCommandView } from './view.js';

/** Own the HomeAlone command view overlay and its Context rail. */
export function createHomeCommandLayer() {
  let viewer = null;
  let enabled = false;
  let lastError = null;
  let lastUpdate = null;
  let count = 0;
  let engine = null;
  let view = null;

  function stageHost() {
    return document.getElementById('home-command-stage');
  }

  function panelHost() {
    return document.getElementById('home-command-panel-host');
  }

  function flyToSite() {
    if (!viewer || viewer.isDestroyed?.()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        HOME_COMMAND_SITE.lon,
        HOME_COMMAND_SITE.lat,
        HOME_COMMAND_SITE.heightM,
      ),
      duration: 1.6,
    });
  }

  const layer = {
    id: HOME_COMMAND_LAYER_ID,
    name: 'Command',
    icon: '🏠',
    source: HOME_COMMAND_SOURCE_NAME,
    updateInterval: HOME_COMMAND_UPDATE_MS,
    showInTogglePanel: false,

    init(nextViewer) {
      if (viewer) throw new Error('Command layer is already initialized');
      viewer = nextViewer;
    },

    enable() {
      enabled = true;
      engine = createHomeCommandDemo();
      const stage = stageHost();
      if (stage) {
        stage.hidden = false;
        view = createHomeCommandView({
          stage,
          panel: panelHost(),
          engine,
        });
        view.mount();
      }
      flyToSite();
      lastError = null;
      lastUpdate = Date.now();
      count = engine.snapshot().cameras.length;
    },

    disable() {
      enabled = false;
      view?.destroy();
      view = null;
      engine = null;
      const stage = stageHost();
      if (stage) {
        stage.hidden = true;
        stage.replaceChildren();
      }
      const panel = panelHost();
      if (panel) panel.replaceChildren();
      lastUpdate = null;
      count = 0;
    },

    update() {
      if (!enabled || !engine) return false;
      try {
        const snapshot = view?.refresh() || engine.snapshot();
        count = snapshot.cameras?.length || 0;
        lastUpdate = Date.now();
        lastError = null;
        return true;
      } catch (error) {
        lastError = error?.message || 'Command view update failed';
        return false;
      }
    },

    getStats() {
      return {
        count,
        lastUpdate,
        error: lastError,
        address: HOME_COMMAND_SITE.address,
      };
    },

    destroy() {
      if (enabled) layer.disable();
      viewer = null;
    },
  };

  return layer;
}
