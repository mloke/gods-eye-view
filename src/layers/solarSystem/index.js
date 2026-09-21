import * as Cesium from 'cesium';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../../renderGovernor.js';
import { getSolarBody, isSolarBodyId } from '../../solarSystem/bodies.js';
import {
  enterSolarSystemBody,
  enterSolarSystemOverview,
  exitSolarSystem,
  hideEarthGlobe,
} from '../../solarSystem/sceneRegime.js';
import {
  SOLAR_SYSTEM_LAYER_ID,
  SOLAR_SYSTEM_SOURCE_NAME,
  SOLAR_SYSTEM_UPDATE_MS,
} from './policy.js';
import { renderSolarSystemPanel } from './panel.js';
import {
  flyToSolarBody,
  flyToSolarOverview,
  pickSolarBodyId,
  syncSolarEntities,
} from './rendering.js';

/** Own the heliocentric Solar System scene and its Context panel. */
export function createSolarSystemLayer({ services } = {}) {
  let viewer = null;
  let dataSource = null;
  let clickHandler = null;
  let enabled = false;
  let focusedBodyId = null;
  let lastError = null;
  let lastUpdate = null;
  let count = 0;

  const layer = {
    id: SOLAR_SYSTEM_LAYER_ID,
    name: 'Solar System',
    icon: '🪐',
    source: SOLAR_SYSTEM_SOURCE_NAME,
    updateInterval: SOLAR_SYSTEM_UPDATE_MS,
    showInTogglePanel: false,

    init(nextViewer) {
      if (viewer) throw new Error('Solar System layer is already initialized');
      viewer = nextViewer;
      dataSource = new Cesium.CustomDataSource('solar-system');
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((click) => {
        if (!enabled) return;
        const picked = viewer.scene.pick(click.position);
        const bodyId = pickSolarBodyId(picked);
        if (bodyId && bodyId !== 'sun') layer.focusBody(bodyId);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    },

    enable() {
      enabled = true;
      if (dataSource) dataSource.show = true;
      enterSolarSystemOverview(viewer);
      hideEarthGlobe(viewer);
      flyToSolarOverview(viewer);
      holdContinuousRender('solar-system');
      layer.update();
      layer.renderPanel();
    },

    disable() {
      enabled = false;
      focusedBodyId = null;
      if (dataSource) {
        dataSource.entities.removeAll();
        dataSource.show = false;
      }
      releaseContinuousRender('solar-system');
      if (viewer && !viewer.isDestroyed?.())
        exitSolarSystem(viewer, { restoreGlobeView: true });
      const host = document.getElementById('solar-system-panel-host');
      if (host) host.innerHTML = '';
      governorRequestRender();
    },

    update() {
      if (!enabled || !dataSource) return false;
      try {
        const epochMs = Date.now();
        count = syncSolarEntities({
          dataSource,
          epochMs,
          focusedBodyId,
          showAssets: true,
        });
        lastUpdate = epochMs;
        lastError = null;
        governorRequestRender();
        return true;
      } catch (error) {
        lastError = error?.message || 'Solar System update failed';
        return false;
      }
    },

    setParams(params = {}) {
      if (!Object.hasOwn(params, 'focusedBodyId')) return true;
      const next = params.focusedBodyId
        ? String(params.focusedBodyId).trim().toLowerCase()
        : null;
      if (next && !isSolarBodyId(next)) return false;
      if (next === focusedBodyId) return true;
      if (!next) {
        layer.focusSystem();
        return true;
      }
      return layer.focusBody(next);
    },

    focusBody(bodyId) {
      const body = getSolarBody(bodyId);
      if (!body || body.id === 'sun') return false;
      focusedBodyId = body.id;
      enterSolarSystemBody(viewer, body.id);
      flyToSolarBody(viewer, body.id, Date.now());
      if (enabled) {
        layer.update();
        layer.renderPanel();
      }
      return true;
    },

    focusSystem() {
      focusedBodyId = null;
      enterSolarSystemOverview(viewer);
      flyToSolarOverview(viewer);
      if (enabled) {
        layer.update();
        layer.renderPanel();
      }
      return true;
    },

    getFocusedBodyId() {
      return focusedBodyId;
    },

    renderPanel() {
      renderSolarSystemPanel(document.getElementById('solar-system-panel-host'), {
        focusedBodyId,
        onSelect: (id) => layer.focusBody(id),
        onBack: () => layer.focusSystem(),
      });
    },

    getStats() {
      return {
        count,
        lastUpdate,
        error: lastError,
        focusedBodyId,
      };
    },

    destroy() {
      if (enabled) layer.disable();
      clickHandler?.destroy?.();
      clickHandler = null;
      if (dataSource && viewer && !viewer.isDestroyed?.())
        viewer.dataSources.remove(dataSource, true);
      dataSource = null;
      viewer = null;
    },
  };

  return layer;
}
