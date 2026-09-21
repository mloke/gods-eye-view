import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { isPickedWorldPosition } from '../../data/scenePick.js';
import { formatLocationTagSnippet } from './records.js';

/** Resolve lat/lon under a screen point, or null when the cursor is off the globe. */
export function pickGroundCoordinates(viewer, screenPosition) {
  const scene = viewer?.scene;
  const camera = viewer?.camera;
  if (!scene || !camera || !screenPosition) return null;
  let cartesian = null;
  if (scene.pickPositionSupported && typeof scene.pickPosition === 'function') {
    try {
      cartesian = scene.pickPosition(screenPosition);
    } catch {
      cartesian = null;
    }
  }
  if (
    !isPickedWorldPosition(cartesian) &&
    typeof camera.getPickRay === 'function'
  ) {
    try {
      cartesian = scene.globe?.pick(camera.getPickRay(screenPosition), scene);
    } catch {
      cartesian = null;
    }
  }
  if (
    !isPickedWorldPosition(cartesian) &&
    typeof camera.pickEllipsoid === 'function'
  ) {
    try {
      cartesian = camera.pickEllipsoid(screenPosition, Cesium.Ellipsoid.WGS84);
    } catch {
      cartesian = null;
    }
  }
  if (!isPickedWorldPosition(cartesian)) return null;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  if (!carto) return null;
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  };
}

async function writeClipboard(text, writeText) {
  if (typeof writeText === 'function') return writeText(text);
  if (typeof navigator?.clipboard?.writeText === 'function')
    return navigator.clipboard.writeText(text);
  throw new Error('Clipboard unavailable');
}

/** Right-click the globe to copy a location-tags.json place snippet. */
export function installLocationTagCopy({
  viewer,
  showToast,
  writeText,
  screenSpaceEventHandlerFactory = (host) =>
    new Cesium.ScreenSpaceEventHandler(host.scene.canvas),
} = {}) {
  if (!viewer?.scene?.canvas)
    throw new TypeError('Location tag copy requires a viewer');
  const canvas = viewer.scene.canvas;
  const handler = screenSpaceEventHandlerFactory(viewer);
  const onContextMenu = (event) => {
    event.preventDefault();
  };
  canvas.addEventListener('contextmenu', onContextMenu);
  handler.setInputAction(async (click) => {
    if (!isPointerFree()) return;
    const coords = pickGroundCoordinates(viewer, click?.position);
    if (!coords) {
      showToast?.('No map location under cursor');
      return;
    }
    const snippet = formatLocationTagSnippet(coords);
    if (!snippet) {
      showToast?.('No map location under cursor');
      return;
    }
    try {
      await writeClipboard(snippet, writeText);
      showToast?.(`Copied ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`);
    } catch {
      showToast?.('Copy failed');
    }
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

  return {
    destroy() {
      handler.destroy?.();
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
