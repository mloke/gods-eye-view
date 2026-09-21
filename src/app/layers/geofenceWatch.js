import * as Cesium from 'cesium';
import { createGeofenceWatchLayer } from '../../layers/geofenceWatch/index.js';
import * as context from '../../data/contextStore.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { overlayHost } from './overlayHost.js';

/** Wire geofence watch to the application overlay host and selection store. */
export function createApplicationGeofenceWatch(options) {
  return createGeofenceWatchLayer({
    overlayHost: {
      ...overlayHost,
      hitTest: overlays.hitTestWorldOverlay,
    },
    context,
    screenSpaceEventHandlerFactory:
      options?.screenSpaceEventHandlerFactory ??
      ((viewer) => new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)),
    ...options,
  });
}
