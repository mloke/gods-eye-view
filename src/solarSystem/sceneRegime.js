import * as Cesium from 'cesium';
import { flyToGlobeView } from '../locations.js';
import {
  applySolarCameraController,
  attachSolarCameraControls,
  captureSolarCameraController,
  detachSolarCameraControls,
  resetSolarCameraForTest,
  restoreSolarCameraController,
} from './camera.js';

const EARTH = Object.freeze({ kind: 'earth', focusedBodyId: null });

let regime = EARTH;
let snapshot = null;

/**
 * Current scene regime. `earth` is the live console; `solar-system` is the
 * heliocentric overview; `body:{id}` is an entered planet or moon.
 */
export function getSceneRegime() {
  return regime;
}

/** True while the Solar System tab owns the globe. */
export function isSolarSystemRegimeActive() {
  return regime.kind !== 'earth';
}

/** Focused body id while a world is entered, otherwise null. */
export function getFocusedSolarBodyId() {
  return regime.focusedBodyId;
}

/**
 * Capture Earth camera / globe / tileset visibility so the tab can restore it.
 * @param {object} viewer
 * @returns {object|null}
 */
export function captureEarthScene(viewer) {
  const scene = viewer?.scene;
  if (!scene) return null;
  const tilesets = [];
  const primitives = scene.primitives;
  const length = primitives?.length || 0;
  for (let i = 0; i < length; i++) {
    const primitive = primitives.get(i);
    if (primitive instanceof Cesium.Cesium3DTileset)
      tilesets.push({ primitive, show: primitive.show });
  }
  return {
    globeShow: Boolean(scene.globe?.show),
    globeDepthTest: scene.globe
      ? Boolean(scene.globe.depthTestAgainstTerrain)
      : null,
    fogEnabled: scene.fog ? Boolean(scene.fog.enabled) : null,
    skyAtmosphereShow: scene.skyAtmosphere
      ? Boolean(scene.skyAtmosphere.show)
      : null,
    maximumZoomDistance: scene.screenSpaceCameraController?.maximumZoomDistance,
    minimumZoomDistance: scene.screenSpaceCameraController?.minimumZoomDistance,
    cameraController: captureSolarCameraController(viewer),
    tilesets,
  };
}

/**
 * Hide the Earth globe and photoreal tiles so the heliocentric scene can own
 * the origin. Safe to call repeatedly.
 * @param {object} viewer
 * @param {object|null} [captured]
 */
export function hideEarthGlobe(viewer, captured = snapshot) {
  const scene = viewer?.scene;
  if (!scene) return;
  if (scene.globe) {
    scene.globe.show = false;
    scene.globe.depthTestAgainstTerrain = false;
  }
  if (scene.fog) scene.fog.enabled = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  const tilesets = captured?.tilesets || [];
  for (const entry of tilesets) {
    if (entry?.primitive && !entry.primitive.isDestroyed?.()) {
      entry.primitive.show = false;
      if ('preloadWhenHidden' in entry.primitive)
        entry.primitive.preloadWhenHidden = false;
    }
  }
  applySolarCameraController(viewer);
}

/**
 * Restore the captured Earth globe / tileset / zoom limits.
 * @param {object} viewer
 * @param {object|null} [captured]
 */
export function restoreEarthScene(viewer, captured = snapshot) {
  const scene = viewer?.scene;
  if (!scene || !captured) return;
  if (scene.globe) {
    scene.globe.show = captured.globeShow;
    if (captured.globeDepthTest !== null)
      scene.globe.depthTestAgainstTerrain = captured.globeDepthTest;
  }
  if (scene.fog && captured.fogEnabled !== null)
    scene.fog.enabled = captured.fogEnabled;
  if (scene.skyAtmosphere && captured.skyAtmosphereShow !== null)
    scene.skyAtmosphere.show = captured.skyAtmosphereShow;
  for (const entry of captured.tilesets || []) {
    if (entry?.primitive && !entry.primitive.isDestroyed?.())
      entry.primitive.show = entry.show;
  }
  restoreSolarCameraController(viewer, captured.cameraController);
  if (scene.screenSpaceCameraController) {
    if (Number.isFinite(captured.maximumZoomDistance))
      scene.screenSpaceCameraController.maximumZoomDistance =
        captured.maximumZoomDistance;
    if (Number.isFinite(captured.minimumZoomDistance))
      scene.screenSpaceCameraController.minimumZoomDistance =
        captured.minimumZoomDistance;
  }
}

/** Enter the heliocentric overview. */
export function enterSolarSystemOverview(viewer) {
  if (!snapshot) snapshot = captureEarthScene(viewer);
  if (viewer && !viewer.isDestroyed?.()) viewer.trackedEntity = undefined;
  hideEarthGlobe(viewer, snapshot);
  attachSolarCameraControls(viewer);
  regime = Object.freeze({ kind: 'solar-system', focusedBodyId: null });
  return regime;
}

/** Enter a planet or moon. */
export function enterSolarSystemBody(viewer, bodyId) {
  if (!snapshot) snapshot = captureEarthScene(viewer);
  if (viewer && !viewer.isDestroyed?.()) viewer.trackedEntity = undefined;
  hideEarthGlobe(viewer, snapshot);
  attachSolarCameraControls(viewer);
  const id = String(bodyId || '').trim().toLowerCase() || null;
  regime = Object.freeze({
    kind: id ? `body:${id}` : 'solar-system',
    focusedBodyId: id,
  });
  return regime;
}

/**
 * Leave the Solar System tab and restore the Earth console.
 * @param {object} viewer
 * @param {{restoreGlobeView?: boolean}} [options]
 */
export function exitSolarSystem(viewer, { restoreGlobeView = true } = {}) {
  detachSolarCameraControls();
  restoreEarthScene(viewer, snapshot);
  snapshot = null;
  regime = EARTH;
  if (restoreGlobeView && viewer?.camera) flyToGlobeView(viewer, { duration: 2.2 });
  return regime;
}

/** Test hook: reset module state without a viewer. */
export function resetSceneRegimeForTest() {
  resetSolarCameraForTest();
  regime = EARTH;
  snapshot = null;
}
